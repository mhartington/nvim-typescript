import { Neovim, Command, Function, Plugin, Autocmd } from 'neovim';
import { fileSync } from 'tmp';

import { TSServer } from './client';
import {
  trim,
  convertToDisplayString,
  getParams,
  getCurrentImports,
  convertDetailEntry,
  reduceByPrefix,
  convertEntry,
  getKind,
  createLocList,
  truncateMsg,
  createQuickFixList,
  isRenameSuccess,
  triggerChar,
  printHighlight
} from './utils';
import { writeFileSync, statSync } from 'fs';
import { DiagnosticHost } from './diagnostic';
import { promptForSelection, applyCodeFixes } from './codeActions';
import protocol from 'typescript/lib/protocol';
// import { debounce } from 'lodash';

@Plugin({ dev: false })
export default class TSHost {
  private nvim: Neovim;
  private client = TSServer;
  private diagnosticHost = DiagnosticHost;
  private maxCompletion: number;
  private expandSnippet: boolean;
  enableDiagnostics: boolean;
  constructor(nvim) {
    this.nvim = nvim;
  }

  // @Command('TSGetErr')
  // async getErr(){
  //   const file = await this.getCurrentFile();
  //   await this.client.getErr({files: [file], delay: 500})
  // }

  @Autocmd('TextChangedP', { pattern: '*', sync: false })
  async onTextChangedP() {
    await this.getType();
  }

  @Command('TSType')
  async getType() {
    await this.reloadFile();
    const args = await this.getCommonData();
    try {
      const typeInfo = await this.client.quickInfo(args);
      if (typeInfo.kind !== '') {
        await printHighlight(
          this.nvim,
          await truncateMsg(this.nvim, typeInfo.displayString),
          'MoreMsg',
          'Function'
        );
      }
    } catch (err) {
      console.warn('in catch', JSON.stringify(err));
    }
  }

  @Command('TSTypeDef')
  async tstypedef() {
    await this.reloadFile();
    const args = await this.getCommonData();
    const typeDefRes = await this.client.getTypeDef(args);

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
    let fixes: protocol.FileCodeEdits[];
    // No imports
    if (!results.length) {
      return this.printMsg('No imports candidates were found.');
    } else if (results.length === 1) {
      fixes = results[0].changes;
    } else {
      await promptForSelection(results, this.nvim).then(res => {
        fixes = res;
      });
    }
    await applyCodeFixes(fixes, this.nvim);
  }

  @Command('TSSig')
  async getSig() {
    await this.reloadFile();
    const args = await this.getCommonData();

    const signature = await this.client.quickInfo(args);
    if (signature) {
      await printHighlight(
        this.nvim,
        signature.displayString,
        'MoreMsg',
        'Function'
      );
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
      await this.nvim.command(
        `silent pedit! +${definition[0].start.line} ${definition[0].file}`
      );
      await this.nvim.command('wincmd P');
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
        await printHighlight(this.nvim, 'Rename canceled', 'ErrorMsg');
        return;
      } else {
        newName = input;
      }
    }

    let changedFiles = [];
    await this.reloadFile();
    const renameArgs = await this.getCommonData();
    const buffNum = await this.nvim.call('bufnr', '%');
    const renameResults = await this.client.renameSymbol({
      ...renameArgs,
      findInComments: false,
      findInStrings: false
    });

    if (renameResults) {
      if (isRenameSuccess(renameResults.info)) {
        let changeCount = 0;
        for (let fileLocation of renameResults.locs) {
          let defFile = fileLocation.file;
          await this.nvim.command(`e! ${defFile}`);
          for (let rename of fileLocation.locs) {
            let { line, offset } = rename.start;

            let substitutions = `${line}substitute/\\%${offset}c${symbol}/${newName}/`;
            await this.nvim.command(substitutions);
            //list: Array<{ filename: string; lnum: number; col: number; text: string }>,
            changedFiles.push({
              filename: defFile,
              lnum: line,
              col: offset,
              text: `Replaced ${symbol} with ${newName}`
            });

            changeCount += 1;
          }
        }

        await this.nvim.command(`buffer ${buffNum}`);
        await this.nvim.call('cursor', [renameArgs.line, renameArgs.offset]);
        createQuickFixList(this.nvim, changedFiles, 'Renames');
        this.printMsg(
          `Replaced ${changeCount} in ${renameResults.locs.length} files`
        );

        return;
      }
      printHighlight(
        this.nvim,
        renameResults.info.localizedErrorMessage,
        'ErrorMsg'
      );
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
        this.printHighlight(params);
      },
      err => printHighlight(this.nvim, err, 'ErrorMsg')
    );
  }

  @Command('TSRefs')
  async tsRefs() {
    await this.reloadFile();
    const args = await this.getCommonData();
    const symbolRefRes = await this.client.getSymbolRefs(args);

    if (!symbolRefRes || (symbolRefRes && symbolRefRes.refs.length === 0)) {
      printHighlight(this.nvim, 'References not found', 'ErrorMsg');
      return;
    }

    const refList = symbolRefRes.refs;
    const locationList = refList.map(ref => {
      return {
        filename: ref.file,
        lnum: ref.start.line,
        col: ref.start.offset,
        text: trim(ref.lineText)
      };
    });
    // Uses QuickFix list as refs can span multiple files. QFList is better.
    createQuickFixList(this.nvim, locationList, 'References');
  }

  @Command('TSEditConfig')
  async tsEditconfig() {
    await this.reloadFile();
    const projectInfo = await this.getProjectInfoFunc();
    if (projectInfo) {
      if (statSync(projectInfo.configFileName).isFile()) {
        this.nvim.command(`e ${projectInfo.configFileName}`);
      } else {
        printHighlight(
          this.nvim,
          `Can't edit config, in an inferred project`,
          'ErrorMsg'
        );
      }
    }
  }

  //Omni functions
  @Function('TSOmnicFunc', { sync: true })
  async getCompletions(args: [number, string]) {
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

  async complete(
    file: string,
    prefix: string,
    offset: number,
    line: number,
    nvimVar: string
  ) {
    const currentLine = await this.nvim.getLine();
    const completeArgs: protocol.CompletionsRequestArgs = {
      file,
      line,
      offset,
      prefix,
      triggerCharacter: triggerChar(currentLine),
      includeInsertTextCompletions: false,
      includeExternalModuleExports: false
    };

    let { isMemberCompletion, entries } = await this.client.getCompletions(
      completeArgs
    );

    // - global completions are sorted by TSServer so that `f` will return a wider set than `foo`
    // - member completions are however returned in a static bunch so that `foo.ba` will return
    //   all members of foo regardless of the prefix.
    // - if there n > maxCompletions members of foo then the code will never make it to the detailed
    //   completions
    // - lets run a regex on the completions so that as the user narrows down the range of possibilities
    //   they will eventually see detailed completions for the member

    const completions =
      isMemberCompletion && prefix ? reduceByPrefix(prefix, entries) : entries;
    if (completions.length > this.maxCompletion) {
      let completionRes = await Promise.all(
        completions.map(async entry => await convertEntry(this.nvim, entry))
      );

      await this.nvim.setVar(nvimVar, completionRes);
      return completionRes;
    }

    let detailedCompletions = await this.client.getCompletionDetails({
      file,
      line,
      offset,
      entryNames: completions.map(v => v.name)
    });

    let completionResDetailed = await Promise.all(
      detailedCompletions.map(
        async entry =>
          await convertDetailEntry(this.nvim, entry, this.expandSnippet)
      )
    );

    await this.nvim.setVar(nvimVar, completionResDetailed);
    return completionResDetailed;
  }

  @Function('TSComplete', { sync: true })
  async tsComplete(args: string) {
    await this.reloadFile();
    let file = await this.getCurrentFile();
    let cursorPos = await this.nvim.window.cursor;
    let line = cursorPos[0];
    let prefix = args;
    let offset = cursorPos[1] + 1;

    // returns the detailed result as well as sets the vim var
    return this.complete(
      file,
      prefix,
      offset,
      line,
      'nvim_typescript#completionRes'
    );
  }

  @Function('TSDeoplete', { sync: false })
  async tsDeoplete(args: [string, number]) {
    await this.reloadFile();
    let file = await this.getCurrentFile();
    let cursorPos = await this.nvim.window.cursor;
    let line = cursorPos[0];
    let [prefix, offset] = args;

    // sets the vim var, but doesn't need to return anything
    this.complete(file, prefix, offset, line, 'nvim_typescript#completion_res');
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
  async getWorkspaceSymbols(args: any[]) {
    await this.reloadFile();
    const file = await this.getCurrentFile();
    const funcArgs = [...args, file];

    const results = await this.getWorkspaceSymbolsFunc(funcArgs);
    if (results) {
      await createLocList(this.nvim, results, 'WorkspaceSymbols');
    }
  }

  @Function('TSGetWorkspaceSymbolsFunc', { sync: true })
  async getWorkspaceSymbolsFunc(args: any[]) {
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

  @Command('TSOrganizeImports')
  async organizeImports() {
    await this.reloadFile()
    const file = await this.getCurrentFile();
    const scopes = await this.client.getOrganizedImports({
      scope: {
        type: 'file',
        args: { file }
      }
    });
    if(scopes){
      applyCodeFixes(scopes, this.nvim);
    } else {
      printHighlight(this.nvim, 'No changes needed')
    }
  }

  @Command('TSGetDiagnostics')
  async getDiagnostics() {
    if (this.enableDiagnostics) {
      await this.reloadFile();
      const file = await this.getCurrentFile();
      const sematicErrors = await this.getSematicErrors(file);
      const syntaxErrors = await this.getSyntaxErrors(file);
      const res = [...sematicErrors, ...syntaxErrors];
      await this.diagnosticHost.placeSigns(res, file);
      await this.handleCursorMoved();
    }
  }

  @Function('TSEchoMessage')
  async handleCursorMoved() {
    const { file, line, offset } = await this.getCommonData();
    const buftype = await this.nvim.eval('&buftype');
    if (buftype !== '') return;
    const errorSign = this.diagnosticHost.getSign(file, line, offset);
    if (errorSign) {
      await printHighlight(
        this.nvim,
        await truncateMsg(this.nvim, errorSign.text),
        'ErrorMsg'
      );
    }
  }

  @Command('TSGetCodeFix')
  async getCodeFix() {
    await this.reloadFile();
    const { file, line, offset } = await this.getCommonData();
    const errorAtCursor = this.diagnosticHost.getSign(file, line, offset);
    if (errorAtCursor) {
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
          rej => printHighlight(this.nvim, rej, 'ErrorMsg')
        );
      } else {
        await this.printMsg('No fix');
      }
    }
  }

  async getSematicErrors(file) {
    return await this.client.getSemanticDiagnosticsSync({ file });
  }
  async getSyntaxErrors(file) {
    return await this.client.getSyntacticDiagnosticsSync({ file });
  }
  async getSuggested(file) {
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
  tsGetVersion() {
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
      this.client.openFile({ file });
      if (this.enableDiagnostics) {

        // this.nvim.buffer.listen('lines', debounce(() => this.getDiagnostics(), 500))
        // this.nvim.buffer.listen('changetick', debounce(() => this.getDiagnostics(), 500))
        await this.getDiagnostics();
      }
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
    await printHighlight(this.nvim, `Server started`, 'MoreMsg');
    await this.onBufEnter();
    // const file = await this.getCurrentFile();
    // this.client.openFile({ file });
    // await this.getDiagnostics();
  }

  @Command('TSStop')
  async tsstop() {
    if (this.client.serverHandle != null) {
      this.client.stopServer();
      await printHighlight(this.nvim, `Server stopped`, 'ErrorMsg');
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
    if (data.entries.length === 0) return [];

    if (data.entries.length > this.maxCompletion) {
      const completions = await Promise.all(
        data.entries.map(async entry => await convertEntry(this.nvim, entry))
      );
      await this.nvim.call('cm#complete', [info, ctx, startcol, completions]);
      return;
    }

    let entryNames = data.entries.map(v => v.name);
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
    if (data.entries.length === 0) return [];

    if (data.entries.length > this.maxCompletion) {
      const completions = await Promise.all(
        data.entries.map(async entry => await convertEntry(this.nvim, entry))
      );
      await this.nvim.call('ncm2#complete', [ctx, startccol, completions]);
      return;
    }

    let entryNames = data.entries.map(v => v.name);
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
      expandSnippet,
      enableDiagnostics
    ] = await Promise.all([
      this.nvim.getVar('nvim_typescript#max_completion_detail'),
      this.nvim.getVar('nvim_typescript#server_path'),
      this.nvim.getVar('nvim_typescript#server_options'),
      this.nvim.getVar('nvim_typescript#default_signs'),
      this.nvim.getVar('nvim_typescript#expand_snippet'),
      this.nvim.getVar('nvim_typescript#diagnostics_enable')
    ]);
    this.enableDiagnostics = !!enableDiagnostics;
    // console.warn(this.enableDiagnostics)
    this.maxCompletion = parseFloat(maxCompletion as string);
    this.expandSnippet = expandSnippet as boolean;
    this.client.setServerPath(serverPath as string);
    this.client.serverOptions = serverOptions as string[];
    await this.diagnosticHost.defineSigns(defaultSigns);
    this.client.setTSConfigVersion();

    this.client.on('projectLoadingFinished', async () => {
      console.warn('ready');
      // console.log('coming soon...');
    });
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
