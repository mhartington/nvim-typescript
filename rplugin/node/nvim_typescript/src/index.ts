import { execSync } from 'child_process';
import { Neovim, Autocmd, Command, Function, Plugin } from 'neovim';
import { fileSync } from 'tmp';
import protocol, { Diagnostic } from 'typescript/lib/protocol';
import { TSServer } from './client';
import {
  trim,
  convertToDisplayString,
  getParams,
  getCurrentImports,
  convertDetailEntry,
  convertEntry,
  getKind,
  createLocList,
  printEllipsis
} from './utils';
import { writeFileSync, statSync, appendFileSync } from 'fs';
import { DiagnosticHost } from './diagnostic';
import {
  promptForSelection,
  applyCodeFixes,
  applyImports
} from './codeActions';

@Plugin({ dev: true })
export default class TSHost {
  private nvim: Neovim;
  private client = TSServer;
  private diagnosticHost = DiagnosticHost;
  private maxCompletion: number;
  private expandSnippet: boolean;
  constructor(nvim) {
    this.nvim = nvim;
  }

  // @Command('TSGetErr')
  // async getErr(){
  //   const file = await this.getCurrentFile();
  //   await this.client.getErr({files: [file], delay: 500})
  // }

  @Command('TSType')
  async getType() {
    const reloadResults = await this.reloadFile();
    const args = await this.getCommonData();
    const typeInfo = await this.client.quickInfo(args);
    if (typeInfo) {
      await printEllipsis(
        this.nvim,
        typeInfo.displayString.replace(/(\r\n|\n|\r)/gm, '')
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
    if (currentlyImportedItems.includes(symbol)) {
      await this.printMsg(`${symbol} is already imported`);
    }
    const results = await this.client.getCodeFixes({
      file,
      startLine: cursorPosition.line,
      endLine: cursorPosition.line,
      startOffset: cursorPosition.col,
      endOffset: cursorPosition.col,
      errorCodes: [2304]
    });
    let fixes;
    // No imports
    if (!results.length) {
      return this.printMsg('No imports canidates were found.');
    } else if (results.length === 1) {
      fixes = results[0].changes;
    } else {
      await promptForSelection(results, this.nvim).then(res => {
        fixes = res;
      });
    }
    await applyImports(fixes, this.nvim);
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
      createLocList(this.nvim, locationList, 'References');
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
      while (start > 0 && currentLine[start - 1].match(/[a-zA-Z_0-9$]/)) {
        if (currentLine[start] === '.') {
          return start + 1;
        }
        start--;
      }
      return start;
    } else {
      // Args[1] is good.
      return await this.tsComplete(args[1]);
    }
  }

  @Function('TSComplete', { sync: true })
  async tsComplete(args: string ) {
    await this.reloadFile();
    let file = await this.getCurrentFile();
    let cursorPos = await this.nvim.window.cursor;
    let line = cursorPos[0];
    let prefix = args;
    let offset = cursorPos[1] + 1;

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
      let completionRes = await Promise.all(completions.map(async entry => await convertEntry(this.nvim, entry)));
      await this.nvim.setVar('nvim_typescript#completionRes', completionRes)
      return completionRes
    }
    let entryNames = completions.map(v => v.name);
    let detailedCompletions = await this.client.getCompletionDetails({
      file,
      line,
      offset,
      entryNames
    });
    let completionResDetailed = await Promise.all(detailedCompletions.map(async entry => await convertDetailEntry(this.nvim, entry, this.expandSnippet)));
    await this.nvim.setVar('nvim_typescript#completionRes', completionResDetailed);
    return completionResDetailed;
  }

  @Function('TSDeoplete', { sync: false })
  async tsDeoplete(args: [string, number]) {
    await this.reloadFile();
    let file = await this.getCurrentFile();
    let cursorPos = await this.nvim.window.cursor;
    let line = cursorPos[0];
    let [prefix, offset] = args;

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
      let completionRes = await Promise.all(completions.map(async entry => await convertEntry(this.nvim, entry)));
      await this.nvim.setVar('nvim_typescript#completion_res', completionRes)
    }
    let entryNames = completions.map(v => v.name);
    let detailedCompletions = await this.client.getCompletionDetails({
      file,
      line,
      offset,
      entryNames
    });
    let completionResDetailed = await Promise.all(detailedCompletions.map(async entry => await convertDetailEntry(this.nvim, entry, this.expandSnippet)));
    await this.nvim.setVar('nvim_typescript#completion_res', completionResDetailed);
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
      createLocList(this.nvim, docSysmbolsLoc, 'Symbols');
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
      await createLocList(this.nvim, results, 'WorkspaceSymbols');
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
        };
      })
    );

    return symbolsRes;
  }

  @Function('TSGetProjectInfoFunc', { sync: true })
  async getProjectInfoFunc() {
    const file = await this.getCurrentFile();
    return await this.client.getProjectInfo({ file, needFileNameList: true });
  }

  @Command('TSGetDiagnostics')
  async getDiagnostics() {
    const file = await this.getCurrentFile();
    const sematicErrors = await this.getSematicErrors(file);
    const syntaxErrors = await this.getSyntaxErrors(file);
    const res = [...sematicErrors, ...syntaxErrors];
    await this.diagnosticHost.placeSigns(res, file);
    await this.handleCursorMoved();
  }

  @Function('TSEchoMessage')
  async handleCursorMoved() {
    const { file, line, offset } = await this.getCommonData();
    const buftype = await this.nvim.eval('&buftype');
    if (buftype !== '') return;
    const errorSign = this.diagnosticHost.getSign(file, line, offset);
    if (errorSign) {
      await printEllipsis(this.nvim, errorSign.text);
    }
  }

  @Command('TSGetCodeFix')
  async getCodeFix() {
    await this.reloadFile();
    const { file, line, offset } = await this.getCommonData();
    const errorAtCursor = this.diagnosticHost.getSign(file, line, offset);

    const fixes = await this.client.getCodeFixes({
      file,
      startLine: errorAtCursor.start.line,
      startOffset: errorAtCursor.start.offset,
      endLine: errorAtCursor.end.line,
      endOffset: errorAtCursor.end.offset,
      errorCodes: [errorAtCursor.code]
    });
    if (fixes.length !== 0) {
      promptForSelection(fixes, this.nvim).then(
        async res => await applyCodeFixes(res, this.nvim),
        rej => this.printErr(rej)
      );
    } else {
      await this.printMsg('No fix');
    }
  }

  @Function('TSGetErrorCountForFile', { sync: true })
  async getErrorsForFile() {
    const file = await this.getCurrentFile();
    const currentStore = this.diagnosticHost.signStore.find(
      entry => entry.file === file
    );
    return currentStore.signs.length;
  }

  async getSematicErrors(file) {
    await this.reloadFile();
    return await this.client.getSemanticDiagnosticsSync({ file });
  }
  async getSyntaxErrors(file) {
    await this.reloadFile();
    return await this.client.getSyntacticDiagnosticsSync({ file });
  }
  async getSuggested(file) {
    await this.reloadFile();
    return await this.client.getSuggestionDiagnosticsSync({ file });
  }

  async openBufferOrWindow(file: string, lineNumber: number, offset: number) {
    const fileIsAlreadyFocused = await this.getCurrentFile().then(
      currentFile => file === currentFile
    );

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
      await this.init();
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
  @Command('TSStart')
  async tsstart() {
    this.client.startServer();
    this.printMsg(`Server started`);
    const file = await this.getCurrentFile();
    this.client.openFile({ file });
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

  @Function('TSNcm2OnComplete')
  async onNcm2Complete(args) {
    const ctx = args[0];

    const line = ctx['lnum'];
    const offset = ctx['ccol'];
    const prefix = ctx['base'];
    const startccol = ctx['startccol'];
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
      await this.nvim.call('ncm2#complete', [ctx, startccol, completions]);
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
    await this.nvim.call('ncm2#complete', [ctx, startccol, detailedEntries]);
  }

  async init() {
    this.diagnosticHost.nvim = this.nvim;

    // Borrowed from https://github.com/mhartington/nvim-typescript/pull/143
    // Much cleaner, sorry I couldn't merge the PR!
    const [
      maxCompletion,
      serverPath,
      serverOptions,
      defaultSigns,
      expandSnippet
    ] = await Promise.all([
      this.nvim.getVar('nvim_typescript#max_completion_detail'),
      this.nvim.getVar('nvim_typescript#server_path'),
      this.nvim.getVar('nvim_typescript#server_options'),
      this.nvim.getVar('nvim_typescript#default_signs'),
      this.nvim.getVar('nvim_typescript#expand_snippet'),

    ]);
    this.maxCompletion = parseFloat(maxCompletion as string);
    this.expandSnippet = (expandSnippet as boolean);
    this.client.setServerPath(serverPath as string);
    this.client.serverOptions = serverOptions as string[];
    await this.diagnosticHost.defineSigns(defaultSigns);
    this.client.setTSConfigVersion();

    // this.client.on('semanticDiag', res => {
    //   console.log('coming soon...');
    // });
  }

  // Utils
  // TODO: Extract to own file
  // Started, see utils.ts
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
