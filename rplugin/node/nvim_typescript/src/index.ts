import { statSync, writeFileSync } from 'fs';
import { debounce } from 'lodash';
import { Autocmd, Command, Function, Neovim, Plugin, Window } from 'neovim';
import { fileSync } from 'tmp';
import protocol from 'typescript/lib/protocol';
import { TSServer } from './client';
import { applyCodeFixes, promptForSelection } from './codeActions';
import { DiagnosticHost } from './diagnostic';
import { createFloatingWindow, createHoverWindow } from './floatingWindow';
import { CompletionChangeEvent, CompletionItem } from './types';
import { convertDetailEntry, convertEntry, createLocList, createQuickFixList, getKind, isRenameSuccess, printHighlight, reduceByPrefix, triggerChar, trim, truncateMsg, processErrors } from './utils';
// import { watch } from 'chokidar'
// import {createMonitor} from 'watch'

// var nsfw = require('nsfw');
// var watchr = require('watchr')

@Plugin({ dev: false })
export default class TSHost {
  private client = TSServer;
  private diagnosticHost = DiagnosticHost;
  private maxCompletion: number;
  private expandSnippet: boolean;
  enableDiagnostics: boolean;
  quietStartup: boolean;

  private completionChangeEvent: CompletionChangeEvent;
  private completedItem: CompletionItem;
  floatingWindow: Window[] = [];
  doingCompletion = false;
  constructor(public nvim: Neovim) { }

  // @Autocmd('TextChangedP', { pattern: '*', sync: true })
  // async onTextChangedP() {
  //   console.warn("MENU ITEM CHANGED")
  // //   await this.tssig();
  // }

  // @Autocmd('CompleteChanged',{ pattern: '*', sync: true })
  // async stopDiag(){
  //
  //   this.completionChangeEvent  = await this.nvim.getVvar('event') as CompletionChangeEvent;
  //   // console.warn(JSON.stringify(this.completionChangeEvent));
  //
  //   // console.warn('COMPLETION START')
  //   this.doingCompletion = true
  // }
  // @Autocmd('CompleteDone', { pattern: '*', sync: true})
  // async onCompleteDone() {
  //   this.completedItem  = await this.nvim.getVvar('completed_item') as CompletionItem;
  //   // console.warn(JSON.stringify(this.completedItem));
  //
  //   // console.warn("COMPLECTION DONE")
  //   this.doingCompletion = false
  //   this.getDiagnostics()
  // }

  @Command('TSType')
  async getType() {
    await this.reloadFile();
    const args = await this.getCommonData();
    try {
      const typeInfo = await this.client.quickInfo(args);
      if (Object.getOwnPropertyNames(typeInfo).length > 0) {
        try{
            const window = await createHoverWindow(this.nvim, typeInfo)
            this.floatingWindow.push(window);
        }
        catch(e){
          await printHighlight( this.nvim, await truncateMsg(this.nvim, typeInfo.displayString), 'MoreMsg', 'Function');
        }
      }
    } catch (err) {
      // console.warn('in catch', JSON.stringify(err));
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
    await printHighlight(this.nvim, 'TSImport is depreciated, please use TSGetCodeFix')
    await this.getCodeFix();
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
      await this.printInSplit(message);
    }
  }

  @Command('TSRename', { nargs: '*' })
  async tsRename(args: string[]) {
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
          const commands = [];

          for (let rename of fileLocation.locs) {
            // debugger;
            let { line, offset } = rename.start;

            const editLine = await this.nvim.buffer.getLines({
              start: line - 1,
              end: line,
              strictIndexing: true
            });
            const newLine = editLine[0].replace(symbol as string, newName);
            commands.concat(
              await this.nvim.buffer.setLines(newLine, {
                start: line - 1,
                end: line,
                strictIndexing: true
              })
            );

            changedFiles.push({
              filename: defFile,
              lnum: line,
              col: offset,
              text: `Replaced ${symbol} with ${newName}`
            });

            changeCount += 1;
          }
          await this.nvim.callAtomic(commands);
        }

        await this.nvim.command(`buffer ${buffNum}`);
        await this.nvim.call('cursor', [
          renameResults.info.triggerSpan.start.line,
          renameResults.info.triggerSpan.start.offset
        ]);

        await createQuickFixList(this.nvim, changedFiles, 'Renames', true);
        await printHighlight(this.nvim, `Replaced ${changeCount} in ${renameResults.locs.length} files`);
        await this.getDiagnostics();

      } else {
        printHighlight(
          this.nvim,
          renameResults.info.localizedErrorMessage,
          'ErrorMsg'
        );
      }
    }
  }

  @Command('TSSig')
  async tssig() {
    // console.warn("IMHERE")
    await this.reloadFile();

    const file = await this.getCurrentFile();
    const [line, offset] = await this.getCursorPos();
    const info = await this.client.getSignature({ file, line, offset });
    console.warn("INFO", info)

    //   const signatureHelpItems = info.items.map(item => {
    //     return {
    //       variableArguments: item.isVariadic,
    //       prefix: convertToDisplayString(item.prefixDisplayParts),
    //       suffix: convertToDisplayString(item.suffixDisplayParts),
    //       separator: convertToDisplayString(item.separatorDisplayParts),
    //       parameters: item.parameters.map(p => {
    //         return {
    //           text: convertToDisplayString(p.displayParts),
    //           documentation: convertToDisplayString(p.documentation)
    //         };
    //       })
    //     };
    //   });
    //   const params = getParams(signatureHelpItems[0].parameters, signatureHelpItems[0].separator);
    //   printHighlight(this.nvim, params);
    // }
    // catch (err) {
    //   console.warn('in catch', JSON.stringify(err));
    // }
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

  async complete(
    file: string,
    prefix: string,
    offset: number,
    line: number,
    nvimVar: string
  ) {
    // console.warn(prefix, offset, line)
    // this.doingCompletion = true
    const currentLine = await this.nvim.call('nvim_get_current_line')
    // console.warn(currentLine)
    let completeArgs: protocol.CompletionsRequestArgs = {
      file,
      line,
      offset,
      prefix,
      includeInsertTextCompletions: false,
      includeExternalModuleExports: false
    };
    if (this.client.isCurrentVersionHighter(300)) {
      completeArgs = { ...completeArgs, triggerCharacter: triggerChar(currentLine) }
    }

    let completions: any;

    if (this.client.isCurrentVersionHighter(300)) {
      let { isMemberCompletion, entries } = await this.client.getCompletions(completeArgs);
      // - global completions are sorted by TSServer so that `f` will return a wider set than `foo`
      // - member completions are however returned in a static bunch so that `foo.ba` will return
      //   all members of foo regardless of the prefix.
      // - if there n > maxCompletions members of foo then the code will never make it to the detailed
      //   completions
      // - lets run a regex on the completions so that as the user narrows down the range of possibilities
      //   they will eventually see detailed completions for the member
      completions = isMemberCompletion && prefix ? reduceByPrefix(prefix, entries) : entries;
    }
    else {
      // console.warn('in ts 2.x')
      completions = await this.client.getCompletions(completeArgs);
    }

    if (completions.length > this.maxCompletion) {
      // console.warn(JSON.stringify(completions))
      let completionRes = await Promise.all(completions.map(async (entry: protocol.CompletionEntry) => await convertEntry(this.nvim, entry)));
      await this.nvim.setVar(nvimVar, completionRes);
      return completionRes;
    }

    let detailedCompletions = await this.client.getCompletionDetails({
      file,
      line,
      offset,
      entryNames: completions.map((v: { name: any; }) => v.name)
    });

    let completionResDetailed = await Promise.all(detailedCompletions.map(async (entry) => await convertDetailEntry(this.nvim, entry, this.expandSnippet)));

    await this.nvim.setVar(nvimVar, completionResDetailed);
    return completionResDetailed;
  }

  //Omni functions
  @Function('TSOmniFunc', { sync: true })
  async getCompletions(args: [number, string]) {
    await this.reloadFile();
    if (!!args[0]) {
      let currentLine = await this.nvim.line;
      let [, col] = await this.getCursorPos();
      let start = col - 1;

      // [\S+$]
      // \w\+$
      while (start > 0 && currentLine[start - 1].match(/[(\w|\_|\.|\-|\>)$]/)) {
        // while (start > 0 && currentLine[start - 1].match(/[\w\+$]/)) {
        if (currentLine[start] === '.') {
          console.warn('currentline position is .')
          return start + 1;
        }
        start--;
      }
      await this.log(`start is: ${start}`)
      return start;
    } else {
      // Args[1] is good.
      return await this.tsComplete(args[1]);
    }
  }


  // @Function('TSComplete', { sync: true })
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

    // console.warn("prefix", prefix);
    // console.warn(JSON.stringify(offset))
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
      maxResultCount
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
    await this.reloadFile();
    const file = await this.getCurrentFile();
    const scopes = await this.client.getOrganizedImports({
      scope: {
        type: 'file',
        args: { file }
      }
    });
    if (scopes) {
      await applyCodeFixes(scopes, this.nvim);
    } else {
      printHighlight(this.nvim, 'No changes needed');
    }
  }

  @Command('TSGetDiagnostics')
  async getDiagnostics() {
    if (this.enableDiagnostics) {
      if (this.doingCompletion === false) {
        console.warn('DOING DiagnosticHost')
        await this.reloadFile();
        const file = await this.getCurrentFile();
        const sematicErrors = await this.getSematicErrors(file);
        const syntaxErrors = await this.getSyntaxErrors(file);
        const suggestionErrors = await this.getSuggested(file);
        const res = [...sematicErrors, ...syntaxErrors, ...suggestionErrors];
        await this.diagnosticHost.placeSigns(res, file);
        await this.onCursorMoved();
        await this.handleCursorMoved();
      }
    }
  }

  @Function('TSCloseWindow')
  async onCursorMoved() {
    if (this.floatingWindow.length > 0) {
      await Promise.all([...this.floatingWindow.map(async window => await this.nvim.windowClose(window, true)), this.floatingWindow = []])
    }
  }
  @Function('TSEchoMessage')
  async handleCursorMoved() {
    const buftype = await this.nvim.eval('&buftype');
    if (buftype !== '') return;

    const { file, line, offset } = await this.getCommonData();
    const errorSign = this.diagnosticHost.getSign(file, line, offset);
    // console.warn(JSON.stringify(errorSign))

    if (errorSign) {
      try {
        const window = await createFloatingWindow(this.nvim, errorSign)
        this.floatingWindow.push(window);
      } catch(e) {
        await printHighlight( this.nvim, await truncateMsg(this.nvim, errorSign.text), 'ErrorMsg');
      }
    }
  }

  @Command('TSGetErrorFull')
  async getErrFull() {
    const { file, line, offset } = await this.getCommonData();
    const buftype = await this.nvim.eval('&buftype');
    if (buftype !== '') return;
    const errorSign = this.diagnosticHost.getSign(file, line, offset);
    if (errorSign) {
      await this.printInSplit(errorSign.text, '__error__');
    }
  }

  async printInSplit(message: string | string[], bufname = '__doc__') {
    const buf: number = await this.nvim.call('bufnr', bufname);

    if (buf > 0) {
      const pageNr = await this.nvim.tabpage.number;
      const pageList: number[] = await this.nvim.call('tabpagebuflist', pageNr);
      const wi: number = await this.nvim.call(`index`, [pageList, buf]);
      if (wi > 0) {
        await this.nvim.command(`${wi + 1} wincmd w`);
      } else {
        await this.nvim.command(`sbuffer ${buf}`);
      }
    } else {
      await this.nvim.command('botright 10split __doc__');
    }
    await this.nvim.callAtomic([
      await this.nvim.buffer.setOption('modifiable', true),
      await this.nvim.command('sil normal! ggdG'),
      await this.nvim.command('resize 10'),
      await this.nvim.buffer.setOption('swapfile', false),
      await this.nvim.window.setOption('number', false),
      await this.nvim.buffer.setOption('buftype', 'nofile'),
      await this.nvim.buffer.insert(message, 0),
      await this.nvim.command('sil normal! gg'),
      await this.nvim.buffer.setOption('modifiable', false)
    ]);
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
        await printHighlight(this.nvim, 'No fix');
      }
    }
  }


  @Command('TSBuild')
  async buildProject() {
    await printHighlight(this.nvim, `Building...`, 'Question');
    await this.reloadFile();
    const file = await this.getCurrentFile();
    await this.client.getProjectError({ file, delay: 0 })
  }

  async processProjectErrorRes(res: any[]) {
    const fmtErrors = processErrors(res)
    try {
      await printHighlight(this.nvim, `Build done`, 'MoreMsg');
      await createQuickFixList(this.nvim, fmtErrors, 'Errors')
    } catch (e) {
      console.warn("ERR in processing", e)
    }
  }

  // @Command('TSFixAll')
  // async getFixAll(){
  //   await this.reloadFile();
  //   const file  = await this.getCurrentFile();
  // }

  @Command('TSGetRefactor', { range: '' })
  async extract() {
    await this.reloadFile();




    // const [start, end] = range;
    const file = await this.getCurrentFile();

    const [, line_start, column_start] = await this.nvim.call('getpos', "'<");
    const [, line_end, column_end] = await this.nvim.call('getpos', "'>");

    // const lines = await this.nvim.buffer.getLines({start: start-1, end, strictIndexing: true})
    // const firstLine = lines[0]
    // const lastLine = lines[lines.length-1]


    // REGEX: Get the position of the first char that is not whitespace
    // const startOffset = firstLine.search(/\S/g)+1;
    // const endOffset = lastLine.search(/\S/g)+1;
    // const startOffset = firstLine.search(/\S/g);
    // const endOffset = lastLine.search(/\S/g);
    const args: protocol.FileRangeRequestArgs = {
      file,
      startLine: line_start,
      endLine: line_end,
      startOffset: column_start,
      endOffset: column_end
    }
    // console.warn(JSON.stringify(args))
    const refactorRes = await this.client.getApplicableRefactors(args);
    // console.warn(JSON.stringify(refactorRes))

  }

  async getSematicErrors(file: string) {
    return await this.client.getSemanticDiagnosticsSync({ file });
  }
  async getSyntaxErrors(file: string) {
    return await this.client.getSyntacticDiagnosticsSync({ file });
  }
  async getSuggested(file: string) {
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
      await this.tsstart();
    }
    else {
      const file = await this.getCurrentFile();
      const buffer = await this.nvim.buffer;
      const bufContent = await buffer.getOption('endofline') ? [...(await buffer.lines), '\n'] : await buffer.lines
      const fileContent =bufContent.join('\n');
      this.client.openFile({ file, fileContent });
      if (this.enableDiagnostics) {
        await this.onCursorMoved();
        await this.getDiagnostics();
        await this.nvim.buffer.listen('lines', debounce(() => this.getDiagnostics(), 500));
      }
    }
  }

  @Function('TSOnBufSave')
  async onBufSave() {
    await this.reloadFile();
  }

  @Function('TSOnBufLeave')
  async onBufLeave(arg: [string]) {
    await this.client.closeFile({ file: arg[0] });
  }

  // Life cycle events
  @Command('TSStart')
  async tsstart() {
    await this.init();
    if (!this.quietStartup) {
      await printHighlight(this.nvim, `Starting Server...`, 'Question');
    }
    await this.client.startServer();
    await this.onBufEnter();
    await this.createWatcher()
  }
  async createWatcher() {
    console.warn('nothing yet')
    // const dir = await this.nvim.call('getcwd');
    // const { fileNames } = await this.getProjectInfoFunc()


    // const watcher = await nsfw(dir, (events) => {
    //     console.warn(JSON.stringify(events))
    // })
    // await watcher.start()



    // createMonitor(dir,{
    //   ignoreDotFiles: true,
    //   ignoreDirectoryPattern: /node_modules/
    // }, monitor => {
    //   // monitor.files(fileNames)
    //   monitor.on("created", function (f, stat) {
    //     console.warn(`CREATE ${f}`)
    //   })
    //   monitor.on("changed", function (f, curr, prev) {
    //     console.warn(`File ${f} was changed`)
    //     console.warn(JSON.stringify(prev))
    //     console.warn(JSON.stringify(curr))
    //     // Handle file changes
    //   })
    // })


    // const watcher = watch('', {
    //   ignored: ['node_modules/**', '.git/**'],
    //   ignoreInitial: true,
    //   cwd: dir,
    //   persistent: true,
    //   usePolling: false,
    //   awaitWriteFinish: true
    // });


    // watcher.on('ready', path => console.warn(`READY: ${path}`))


    //   watcher.add(fileNames);
    //   watcher.on('raw', (event, path, {watchedPath}) => {
    //     if (event === 'rename') {
    //         console.warn('PATH: ', path)
    //         console.warn("WATCHEDPATH: ", watchedPath)
    //         // this.watcher.unwatch(watchedPath);
    //         // this.watcher.add(watchedPath);
    //     }
    // });
    // watcher.on('add', path => console.warn(`File ${path} was created`));
    // watcher.on('change', (path, stats) => {
    //   if (stats) console.warn(`File ${path} changed size to ${stats.size}`);
    // });
    // console.warn(JSON.stringify(watcher.getWatched()));


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
    await this.getDiagnostics();
  }

  @Function('TSCmRefresh')
  async onCMRefresh(args: any[]) {
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
  async onNcm2Complete(args: any[]) {
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
    await this.diagnosticHost.createNamespace();
    // this.log(`${this.nvim.channel_id}`)
    // Borrowed from https://github.com/mhartington/nvim-typescript/pull/143
    // Much cleaner, sorry I couldn't merge the PR!
    const [
      maxCompletion,
      serverPath,
      serverOptions,
      defaultSigns,
      expandSnippet,
      enableDiagnostics,
      quietStartup,
      channelID
    ] = await Promise.all([
      this.nvim.getVar('nvim_typescript#max_completion_detail'),
      this.nvim.getVar('nvim_typescript#server_path'),
      this.nvim.getVar('nvim_typescript#server_options'),
      this.nvim.getVar('nvim_typescript#default_signs'),
      this.nvim.getVar('nvim_typescript#expand_snippet'),
      this.nvim.getVar('nvim_typescript#diagnostics_enable'),
      this.nvim.getVar('nvim_typescript#quiet_startup'),
      this.nvim.apiInfo
    ]);
    await this.nvim.setVar('nvim_typescript#channel_id', channelID[0]);
    this.enableDiagnostics = !!enableDiagnostics;
    this.quietStartup = !!quietStartup;
    // console.warn(this.enableDiagnostics)
    this.maxCompletion = parseFloat(maxCompletion as string);
    this.expandSnippet = expandSnippet as boolean;
    this.client.setServerPath(serverPath as string);
    this.client.serverOptions = serverOptions as string[];
    await this.diagnosticHost.defineSigns(defaultSigns);
    this.client.setTSConfigVersion();

    // this.nvim.on('changedtick', () => printHighlight(this.nvim,'test'));
    this.client.on('projectLoadingFinish', async () => {
      if (!this.quietStartup) {
        await printHighlight(this.nvim, `Server started`, 'MoreMsg');
      }
    });
    this.client.on('getErrCompleted', async res => await this.processProjectErrorRes(res));

    // this.nvim.on('notification', async (method, args)=> {
    //   console.warn(method)
    // });
  }

  // Utils
  // TODO: Extract to own file
  // Started, see utils.ts
  async log(message: any) {
    await this.nvim.outWrite(`${message} \n`);
  }

  async reloadFile(): Promise<any> {
    return new Promise(async (resolve) => {
      const file = await this.getCurrentFile();
      const buffer = await this.nvim.buffer;
      const bufContent = await buffer.getOption('endofline') ? [...(await buffer.lines), '\n'] : await buffer.lines

      const contents = bufContent.join('\n');

      const temp = fileSync();
      writeFileSync(temp.name, contents, 'utf8');
      return this.client
        .updateFile({ file, tmpfile: temp.name })
        .then(res => resolve(res))
        .then(() => temp.removeCallback())
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
