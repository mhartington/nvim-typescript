import { execSync } from 'child_process';
import { Neovim, Autocmd, Command, Function, Plugin } from 'neovim';
import { fileSync } from 'tmp';
import protocol from 'typescript/lib/protocol';
import { Client } from './client';
import {
  trim,
  convertToDisplayString,
  getParams,
  getCurrentImports,
  getImportCandidates,
  convertDetailEntry,
  convertEntry,
  getKind
} from './utils';
import { writeFileSync, statSync } from 'fs';

@Plugin({ dev: true })
export default class TSHost {
  private nvim: Neovim;
  private client = Client;
  private maxCompletion: number;

  constructor(nvim) {
    this.nvim = nvim;
    this.nvim
      .getVar('nvim_typescript#max_completion_detail')
      .then((res: string) => (this.maxCompletion = parseFloat(res)));
    this.nvim
      .getVar('nvim_typescript#server_path')
      .then((val: string) => this.client.setServerPath(val));
    this.nvim
      .getVar('nvim_typescript#server_options')
      .then((val: any) => (this.client.serverOptions = val));
  }

  @Command('TSType')
  async getType() {
    const reloadResults = await this.reloadFile();
    const args = await this.getCommonData();
    const typeInfo = await this.client.quickInfo(args);
    if (typeInfo) {
      await this.printMsg(
        `${typeInfo.displayString.replace(/(\r\n|\n|\r)/gm, '')}`
      );
    }
  }

  @Command('TSTypeDef')
  async tstypedef() {
    await this.reloadFile();
    const args = await this.getCommonData();
    const typeDefRes = await this.client.getTypeDef(args);
    console.debug(typeDefRes);

    if (typeDefRes && typeDefRes.length > 0) {
      const defFile = typeDefRes[0].file;
      const defLine = typeDefRes[0].start.line;
      const defOffset = typeDefRes[0].start.offset;
      await this.openBufferOrWindow(defFile, defLine, defOffset);
    }
  }

  @Command('TSImport')
  async tsImport() {
    await this.reloadFile();
    const file = await this.getCurrentFile();
    const symbol = await this.nvim.call('expand', '<cword>');
    const [line, col] = await this.getCursorPos();
    const cursorPosition = { line, col };

    const currentlyImportedItems = await getCurrentImports(this.client, file);
    if ((currentlyImportedItems as Array<string>).includes(symbol)) {
      await this.printMsg(`${symbol} is already imported`);
    }
    const results = await getImportCandidates(
      this.client,
      file,
      cursorPosition
    );
    let fixes;
    // No imports
    if (!results.length) {
      return this.printMsg('No imports canidates were found.');
    } else if (results.length === 1) {
      fixes = results[0].changes;
    } else {
      const changeDescriptions = results.map(change => change.description);
      const canidates = changeDescriptions.map(
        (change, idx) => `\n[${idx}]: ${change}`
      );
      const input = await this.nvim.call(
        'input',
        `nvim-ts: More than 1 candidate found, Select from the following options: \n${canidates} \nplease choose one: `
      );

      if (!input) {
        await this.printErr('Inport canceled');
        return;
      }
      if (parseInt(input) > results.length - 1) {
        await this.printErr('Selection not valid');
        return;
      } else {
        fixes = results[parseInt(input)].changes;
      }
    }
    this.applyImportChanges(fixes);
  }
  async applyImportChanges(fixes: protocol.FileCodeEdits[]) {
    for (let fix of fixes) {
      for (let change of fix.textChanges) {
        const changeLine = change.start.line - 1;
        const changeOffset = change.start.offset;
        const leadingNewLineRexeg = /^\n/;
        const leadingAndTrailingNewLineRegex = /^\n|\n$/;
        const addingNewLine = change.newText.match(leadingNewLineRexeg)
          ? true
          : false;
        const newText = change.newText.replace(
          leadingAndTrailingNewLineRegex,
          ''
        );

        if (changeOffset === 1) {
          console.log('changOffset === 1');
          await this.nvim.buffer.insert(newText, changeLine);
        } else if (addingNewLine) {
          console.log('adding new line');
          await this.nvim.buffer.insert(newText, changeLine + 1);
        } else {
          const addingTrailingComma = newText.match(/^,$/) ? true : false;
          const linesToChange = await this.nvim.buffer.getLines({
            start: changeLine,
            end: changeLine + 1,
            strictIndexing: true
          });
          const lineAlreadyHasTrailingComma = linesToChange[0].match(/^.*,\s*$/)
            ? true
            : false;

          if (addingTrailingComma && lineAlreadyHasTrailingComma) {
            console.log('nothing to see folks');
          } else {
            console.log('no trailing comma, and line has no trailing comma');
            await this.nvim.buffer.setLines(
              `${linesToChange[0].substring(
                changeOffset - 1,
                0
              )}${newText}${linesToChange[0].substring(changeOffset - 1)} `,
              { start: changeLine, end: changeLine + 1, strictIndexing: true }
            );
          }
        }
      }
    }
    await this.printMsg('Import applied');
  }

  @Command('TSSig')
  async getSig() {
    await this.reloadFile();
    const args = await this.getCommonData();

    const signature = await this.client.quickInfo(args);
    if (signature) {
      await this.printHighlight(signature.displayString);
    }
  }

  @Command('TSDef')
  async getDef() {
    const definition = await this.getDefFunc();
    if (definition) {
      const defFile = definition[0].file;
      const defLine = definition[0].start.line;
      const defOffset = definition[0].start.offset;
      await this.openBufferOrWindow(defFile, defLine, defOffset);
    }
  }
  @Command('TSDefPreview')
  async getDefPreview() {
    const definition = await this.getDefFunc();
    if (definition) {
      this.nvim.command(
        `split! +${definition[0].start.line} ${definition[0].file}`
      );
    }
  }
  async getDefFunc() {
    await this.reloadFile();
    const args = await this.getCommonData();
    return this.client.getDef(args);
  }

  @Command('TSDoc')
  async getDoc() {
    await this.reloadFile();
    const args = await this.getCommonData();
    const info = await this.client.quickInfo(args);
    if (info) {
      const displayString = info.displayString.split('\n');
      const doc = info.documentation.split('\n');
      const message = displayString.concat(doc);

      const buf = await this.nvim.call('bufnr', '__doc__');

      if (buf > 0) {
        const pageNr = await this.nvim.tabpage.number;
        const pageList: number[] = await this.nvim.call(
          'tabpagebuflist',
          pageNr
        );
        const wi = await this.nvim.call(`index`, [pageList, buf]);
        if (wi > 0) {
          await this.nvim.command(`${wi + 1} wincmd w`);
        } else {
          await this.nvim.command(`sbuffer ${buf}`);
        }
      } else {
        await this.nvim.command('split __doc__');
      }
      for (let setting of [
        'setlocal modifiable',
        'setlocal noswapfile',
        'setlocal nonumber',
        'setlocal buftype=nofile'
      ]) {
        await this.nvim.command(setting);
      }
      await this.nvim.command('sil normal! ggdG');
      await this.nvim.command('resize 10');
      await this.nvim.buffer.insert(message, 0);
      await this.nvim.command('setlocal nomodifiable');
      await this.nvim.command('sil normal! gg');
    }
  }

  @Command('TSRename', { nargs: '*' })
  async tsRename(args) {
    const symbol = await this.nvim.eval('expand("<cword>")');

    let newName: string;

    if (args.length > 0) {
      newName = args[0];
    } else {
      const input = await this.nvim.call(
        'input',
        `nvim-ts: rename ${symbol} to `
      );
      if (!input) {
        await this.printErr('Rename canceled');
        return;
      } else {
        newName = input;
      }
    }

    await this.reloadFile();
    const renameArgs = await this.getCommonData();
    const buffNum = await this.nvim.call('bufnr', '%');
    const renameResults = await this.client.renameSymbol({
      ...renameArgs,
      findInComments: false,
      findInStrings: false
    });
    if (renameResults) {
      if (renameResults.info.canRename) {
        let changeCount = 0;
        for (let fileLocation of renameResults.locs) {
          let defFile = fileLocation.file;
          await this.nvim.command(`e! ${defFile}`);
          for (let rename of fileLocation.locs) {
            let { line, offset } = rename.start;
            let substitutions = `${line}substitute/\\%${offset}c${symbol}/${newName}/`;
            await this.nvim.command(substitutions);
            changeCount += 1;
          }
        }

        await this.nvim.command(`buffer ${buffNum}`);
        await this.nvim.call('cursor', [renameArgs.line, renameArgs.offset]);
        this.printMsg(
          `Replaced ${changeCount} in ${renameResults.locs.length} files`
        );
      }
    } else {
      this.printErr(renameResults.info.localizedErrorMessage);
    }
  }

  @Command('TSSig')
  async tssig() {
    await this.reloadFile();
    const file = await this.getCurrentFile();
    const [line, offset] = await this.getCursorPos();

    this.client.getSignature({ file, line, offset }).then(
      info => {
        const signatureHelpItems = info.items.map(item => {
          return {
            variableArguments: item.isVariadic,
            prefix: convertToDisplayString(item.prefixDisplayParts),
            suffix: convertToDisplayString(item.suffixDisplayParts),
            separator: convertToDisplayString(item.separatorDisplayParts),
            parameters: item.parameters.map(p => {
              return {
                text: convertToDisplayString(p.displayParts),
                documentation: convertToDisplayString(p.documentation)
              };
            })
          };
        });
        console.log(signatureHelpItems);
        const params = getParams(
          signatureHelpItems[0].parameters,
          signatureHelpItems[0].separator
        );
        // this.printHighlight(params);
      },
      err => this.printErr(err)
    );
  }

  @Command('TSRefs')
  async tsRefs() {
    await this.reloadFile();
    const args = await this.getCommonData();
    const symbolRefRes = await this.client.getSymbolRefs(args);
    if (symbolRefRes && symbolRefRes.refs.length > 0) {
      const refList = symbolRefRes.refs;
      const locationList = refList.map(ref => {
        return {
          filename: ref.file,
          lnum: ref.start.line,
          col: ref.start.offset,
          text: trim(ref.lineText)
        };
      });
      this.createLocList(locationList, 'References');
    }
    {
      this.printErr('References not found');
    }
  }

  @Command('TSEditConfig')
  async tsEditconfig(self) {
    await this.reloadFile();
    const projectInfo = await this.getProjectInfoFunc();
    if (projectInfo) {
      if (statSync(projectInfo.configFileName).isFile()) {
        this.nvim.command(`e ${projectInfo.configFileName}`);
      } else {
        this.printErr(`Can't edit config, in an inferred project`);
      }
    }
  }

  //Omni functions
  @Function('TSOmnicFunc', { sync: true })
  async getCompletions(args) {
    if (!!args[0]) {
      let currentLine = await this.nvim.line;
      let [line, col] = await this.getCursorPos();
      let start = col - 1;
      while (start >= 0 && currentLine[start - 1].match(/[a-zA-Z_0-9$]/)) {
        start--;
      }
      return start;
    } else {
      // Args[1] is good.
      return await this.tsComplete(args[1]);
    }
  }

  @Function('TSComplete', { sync: true })
  async tsComplete(args: string | [string, number]) {
    await this.reloadFile();
    let file = await this.getCurrentFile();
    let cursorPos = await this.nvim.window.cursor;
    let line = cursorPos[0];
    let offset, prefix;
    if (typeof args === 'string') {
      prefix = args;
      offset = cursorPos[1] + 1;
    } else {
      prefix = args[0];
      offset = args[1];
    }

    let completions = await this.client.getCompletions({
      file,
      line,
      offset,
      prefix,
      includeInsertTextCompletions: false,
      includeExternalModuleExports: false
    });
    // K, we got our first set of completion data, now lets sort...
    // console.log(completions.length)
    if (completions.length > this.maxCompletion) {
      return await Promise.all(
        completions.map(async entry => await convertEntry(this.nvim, entry))
      );
    }
    let entryNames = completions.map(v => v.name);
    let detailedCompletions = await this.client.getCompletionDetails({
      file,
      line,
      offset,
      entryNames
    });
    return await Promise.all(
      detailedCompletions.map(
        async entry => await convertDetailEntry(this.nvim, entry)
      )
    );
  }

  //Display Doc symbols in loclist
  @Command('TSGetDocSymbols')
  async getdocsymbols() {
    const file = await this.getCurrentFile();
    const docSysmbols = await this.getdocsymbolsFunc();
    let docSysmbolsLoc = [];
    const symbolList = docSysmbols.childItems;
    if (symbolList.length > 0) {
      for (let symbol of symbolList) {
        docSysmbolsLoc.push({
          filename: file,
          lnum: symbol.spans[0].start.line,
          col: symbol.spans[0].start.offset,
          text: symbol.text
        });
        if (symbol.childItems && symbol.childItems.length > 0) {
          for (let childSymbol of symbol.childItems) {
            docSysmbolsLoc.push({
              filename: file,
              lnum: childSymbol.spans[0].start.line,
              col: childSymbol.spans[0].start.offset,
              text: childSymbol.text
            });
          }
        }
      }
      this.createLocList(docSysmbolsLoc, 'Symbols');
    }
  }

  @Function('TSGetDocSymbolsFunc', { sync: true })
  async getdocsymbolsFunc() {
    await this.reloadFile();
    const file = await this.getCurrentFile();
    return await this.client.getDocumentSymbols({ file });
  }

  @Command('TSGetWorkspaceSymbols', { nargs: '*' })
  async getWorkspaceSymbols(args) {
    await this.reloadFile();
    const file = await this.getCurrentFile();
    const funcArgs = [...args, file];

    const results = await this.getWorkspaceSymbolsFunc(funcArgs);
    if (results) {
      await this.createLocList(results, 'WorkspaceSymbols');
    }
  }

  @Function('TSGetWorkspaceSymbolsFunc', { sync: true })
  async getWorkspaceSymbolsFunc(args) {
      const searchValue = args.length > 0 ? args[0] : '';
      const maxResultCount = 50;
      const results = await this.client.getWorkspaceSymbols({
          file: args[1],
          searchValue,
          maxResultCount: 50
      });

      const symbolsRes = await Promise.all(
      results.map(async symbol => {
        return {
          filename: symbol.file,
          lnum: symbol.start.line,
          col: symbol.start.offset,
          text: `${await getKind(this.nvim, symbol.kind)}\t ${symbol.name}`
        }
      }))

      return symbolsRes;
  }

  @Function('TSGetProjectInfoFunc', { sync: true })
  async getProjectInfoFunc() {
    const file = await this.getCurrentFile();
    return await this.client.getProjectInfo({ file, needFileNameList: true });
  }

  async createLocList(
    list: Array<{ filename: string; lnum: number; col: number; text: string }>,
    title: string
  ) {
    return new Promise(async (resolve, reject) => {
      await this.nvim.call('setloclist', [0, list, 'r', title]);
      await this.nvim.command('lwindow');
      resolve();
    });
  }

  async openBufferOrWindow(file: string, lineNumber: number, offset: number) {

    const fileIsAlreadyFocused =
        await this.getCurrentFile().then(currentFile => file === currentFile);

    if (fileIsAlreadyFocused) {
        await this.nvim.command(`call cursor(${lineNumber}, ${offset})`);
        return;
    }

    const windowNumber = await this.nvim.call('bufwinnr', file);
    if (windowNumber != -1) {
      await this.nvim.command(`${windowNumber}wincmd w`);
    } else {
      await this.nvim.command(`e ${file}`);
    }
    await this.nvim.command(`call cursor(${lineNumber}, ${offset})`);
  }

  //SERVER Utils

  @Function('TSGetServerPath', { sync: true })
  tsGetServerPath() {
    // Get the path of the tsserver
    return this.client.serverPath;
  }

  @Function('TSGetVersion', { sync: true })
  tsGetVersion(self, args) {
    return this.client.tsConfigVersion;
  }

  // autocmd function syncs
  @Function('TSOnBufEnter')
  async onBufEnter() {
    if (this.client.serverHandle == null) {
      this.client.setTSConfigVersion();
      await this.tsstart();
    } else {
      const file = await this.getCurrentFile();
      await this.client.openFile({ file });
    }
  }

  @Function('TSOnBufSave')
  async onBufSave() {
    await this.reloadFile();
  }

  // Life cycle events
  @Command('TSStart', {})
  async tsstart() {
    if (this.client.serverHandle === null) {
      await this.client.startServer();
      await this.printMsg(`Server started`);
      const file = await this.getCurrentFile();
      await this.client.openFile({ file });
    } else {
      console.log('server is running');
      const file = await this.getCurrentFile();
      await this.client.openFile({ file });
    }
  }

  @Command('TSStop')
  async tsstop() {
    if (this.client.serverHandle != null) {
      this.client.stopServer();
      await this.printMsg(`Server Stopped`);
    }
  }

  @Command('TSReloadProject')
  async reloadProject() {
    await this.client.reloadProject();
  }

  @Function('TSCmRefresh')
  async onCMRefresh(args) {
    const info = args[0];
    const ctx = args[1];

    const line = ctx['lnum'];
    const offset = ctx['col'];
    const prefix = ctx['base'];
    const startcol = ctx['startcol'];
    // recheck
    if (await this.nvim.call('cm#context_changed', ctx)) return;
    await this.reloadFile();
    const file = await this.getCurrentFile();
    const data = await this.client.getCompletions({
      file,
      line,
      offset,
      prefix,
      includeInsertTextCompletions: false,
      includeExternalModuleExports: false
    });
    if (data.length === 0) return [];

    if (data.length > this.maxCompletion) {
      const completions = await Promise.all(
        data.map(async entry => await convertEntry(this.nvim, entry))
      );
      await this.nvim.call('cm#complete', [info, ctx, startcol, completions]);
      return;
    }

    let entryNames = data.map(v => v.name);
    const detailedCompletions = await this.client.getCompletionDetails({
      file,
      line,
      offset,
      entryNames
    });
    const detailedEntries = await Promise.all(
      detailedCompletions.map(
        async entry => await convertDetailEntry(this.nvim, entry)
      )
    );
    await this.nvim.call('cm#complete', [info, ctx, startcol, detailedEntries]);
  }

  // Utils
  // TODO: Extract to own file
  async printErr(message: string) {
    await this.nvim.errWrite(`nvim-ts: ${message} \n`);
  }
  async printMsg(message: string) {
    await this.nvim.outWrite(`nvim-ts: ${message} \n`);
  }
  async printHighlight(message) {
    await this.nvim.command(
      `redraws! | echom "nvim-ts: " | echohl Function | echon "${message}" | echohl None`
    );
  }
  async log(message: any) {
    await this.nvim.outWrite(`${message} \n`);
  }

  async reloadFile(): Promise<any> {
    return new Promise(async (resolve, reject) => {
      const file = await this.getCurrentFile();
      const contents = (await this.nvim.buffer.lines).join('\n');
      console.debug('FILE', file);
      const temp = fileSync();
      writeFileSync(temp.name, contents, 'utf8');
      return this.client
        .updateFile({ file, tmpfile: temp.name })
        .then(res => resolve(res));
    });
  }
  async getCurrentFile(): Promise<string> {
    return await this.nvim.buffer.name;
  }
  async getCursorPos(): Promise<[number, number]> {
    return await this.nvim.window.cursor;
  }
  async getCommonData(): Promise<{
    file: string;
    line: number;
    offset: number;
  }> {
    let file = await this.getCurrentFile();
    let cursorPos = await this.getCursorPos();
    return {
      file,
      line: cursorPos[0],
      offset: cursorPos[1] + 1
    };
  }
}
