import { statSync, writeFileSync } from 'fs';
import { debounce } from 'lodash-es';
import { Neovim, NvimPlugin, Window } from 'neovim';
import { fileSync } from 'tmp';
import protocol from 'typescript/lib/protocol';
import { TSServer } from './client';
import { applyCodeFixes, promptForSelection } from './codeActions';
import { DiagnosticHost } from './diagnostic';
import {
  createFloatingWindow,
  updateFloatingWindow,
} from './floatingWindow';
import {
  convertDetailEntry,
  convertEntry,
  createLocList,
  createQuickFixList,
  getKind,
  isRenameSuccess,
  printHighlight,
  reduceByPrefix,
  triggerChar,
  trim,
  truncateMsg,
  processErrors,
} from './utils';

module.exports = (plugin: NvimPlugin) => {
  const nvim: Neovim = plugin.nvim;

  const client = TSServer;
  const diagnosticHost = DiagnosticHost;

  let windowRef: Window = null;
  let maxCompletion: number = 50;
  let expandSnippet: boolean = false;
  let enableDiagnostics: boolean = false;
  let quietStartup: boolean = false;
  let openFiles = [];

  let suggestionsEnabled: any = false;
  let updateTime: number = 0;
  let windowLock = false;

  const showInWindow = async(symbol: any, type: "Error" | "Type") => {
    if (windowLock) {
      await new Promise((resolve) => {
        const intervalId = setInterval(() => {
          if (!windowLock) {
            clearInterval(intervalId);
            resolve();
          }
        }, 100);
      });
    }
    windowLock = true;

    try {
      if (!windowRef) {
        windowRef = await createFloatingWindow(nvim, symbol, type)
      } else {
        windowRef = await updateFloatingWindow(nvim, windowRef, symbol, type);
      }
    }


    catch {
      // Probably window was closed by the user
      windowRef = null;
      await showInWindow(symbol, type);
    }
    windowLock = false;
  }

  // Utils
  const init = async () => {
    diagnosticHost.nvim = nvim;
    await diagnosticHost.createNamespace();
    const [
      maxCompletionVar,
      serverPathVar,
      serverOptionsVar,
      defaultSignsVar,
      expandSnippetVar,
      enableDiagnosticsVar,
      quietStartupVar,
      channelIDVar,
      suggestionsEnabledVar,
      redrawTimeVar,
    ] = await Promise.all([
      nvim.getVar('nvim_typescript#max_completion_detail'),
      nvim.getVar('nvim_typescript#server_path'),
      nvim.getVar('nvim_typescript#server_options'),
      nvim.getVar('nvim_typescript#default_signs'),
      nvim.getVar('nvim_typescript#expand_snippet'),
      nvim.getVar('nvim_typescript#diagnostics_enable'),
      nvim.getVar('nvim_typescript#quiet_startup'),
      nvim.apiInfo,
      nvim.getVar('nvim_typescript#suggestions_enabled'),
      nvim.getOption('redrawtime') as Promise<string>,
    ]);

    updateTime = parseInt(redrawTimeVar as string);
    await nvim.setVar('nvim_typescript#channel_id', channelIDVar[0]);
    enableDiagnostics = !!enableDiagnosticsVar;
    quietStartup = !!quietStartupVar;
    maxCompletion = parseFloat(maxCompletionVar as string);
    expandSnippet = expandSnippetVar as boolean;
    client.setServerPath(serverPathVar as string);
    client.serverOptions = serverOptionsVar as string[];
    suggestionsEnabled = suggestionsEnabledVar;

    await diagnosticHost.defineSigns(defaultSignsVar);
    client.setTSConfigVersion();

    // nvim.on('changedtick', () => printHighlight(nvim,'test'));
    client.on('projectLoadingFinish', async () => {
      if (!quietStartup) {
        await printHighlight(nvim, `Server started`, 'MoreMsg');
      }
    });
    client.on(
      'getErrCompleted',
      async (res) => await processProjectErrorRes(res)
    );
  };
  const reloadFile = async () => {
    const file = await getCurrentFile();
    const buffer = await nvim.buffer;
    const bufContent = (await buffer.getOption('endofline'))
      ? [...(await buffer.lines), '\n']
      : await buffer.lines;

    const contents = bufContent.join('\n');

    const temp = fileSync();
    writeFileSync(temp.name, contents, 'utf8');
    await client.updateFile({ file, tmpfile: temp.name });
    temp.removeCallback();
  };
  const getCurrentFile = async () => await nvim.buffer.name;
  const getCursorPos = async () => await nvim.window.cursor;
  const getCommonData = async () => {
    let file = await getCurrentFile();
    let cursorPos = await getCursorPos();
    return {
      file,
      line: cursorPos[0],
      offset: cursorPos[1] + 1,
    };
  };

  const tsstart = async () => {
    await init();
    if (!quietStartup) {
      await printHighlight(nvim, `Starting Server...`, 'Question');
    }
    client.startServer();
    await onBufEnter();
  };
  const tsstop = async () => {
    if (client.serverHandle != null) {
      client.stopServer();
      await printHighlight(nvim, `Server stopped`, 'ErrorMsg');
    }
  };
  const reloadProject = async () => {
    client.reloadProject();
    await getDiagnostics();
  };


  const getSematicErrors = async (file: string) => await client.getSemanticDiagnosticsSync({ file });
  const getSyntaxErrors = async (file: string) => await client.getSyntacticDiagnosticsSync({ file });
  const getSuggested = async (file: string) => await client.getSuggestionDiagnosticsSync({ file });
  const openBufferOrWindow = async ( file: string, lineNumber: number, offset: number) => {
    const currentFile = await getCurrentFile();
    const fileIsAlreadyFocused = file === currentFile;

    if (fileIsAlreadyFocused) {
      await nvim.command(`call cursor(${lineNumber}, ${offset})`);
      return;
    }
    const windowNumber = await nvim.call('bufwinnr', file);
    if (windowNumber != -1) {
      await nvim.command(`${windowNumber}wincmd w`);
    } else {
      await nvim.command(`e ${file}`);
    }
    await nvim.command(`call cursor(${lineNumber}, ${offset})`);
  };

  const tsBuild = async () => {
    await printHighlight(nvim, `Building...`, 'Question');
    await reloadFile();
    const file = await getCurrentFile();
    client.getProjectError({ file, delay: 0 });
  };
  const processProjectErrorRes = async (res: any[]) => {
    const fmtErrors = processErrors(res);
    await printHighlight(nvim, `Build done`, 'MoreMsg');
    await createQuickFixList(nvim, fmtErrors, 'Errors');
  };

  //Server Utils
  const tsGetServerPath = () => client.serverPath;
  const tsGetVersion = () => client.tsConfigVersion;

  //Buffer Events
  const onBufEnter = async (arg?: [string]) => {
    if (client.serverHandle == null) {
      await tsstart();
    } else {
      const file = await getCurrentFile();
      if (arg && arg[0] !== file) {
        return;
      }
      if (!openFiles.includes(file)) {
        openFiles.push(file);
        const buffer = await nvim.buffer;
        const bufContent = (await buffer.getOption('endofline'))
          ? [...(await buffer.lines), '\n']
          : await buffer.lines;
        const fileContent = bufContent.join('\n');
        client.openFile({ file, fileContent });
        if (enableDiagnostics) {
          await closeFloatingWindow();
          await getDiagnostics();
          nvim.buffer.listen(
            'lines',
            debounce(() => {
              // if(!doingCompletion){
              getDiagnostics();
              // }
            }, 1000)
          );
        }
      } else {
        await closeFloatingWindow();
        await getDiagnostics();
      }
      // console.warn('OPENED FILES', JSON.stringify(openFiles));
    }
  };
  const onBufSave = async () => await reloadFile();
  const onBufLeave = (arg: [string]) => {
    const [file] = arg;
    if (client.serverHandle && file) {
      openFiles = openFiles.filter((e) => e != file);
      client.closeFile({ file });
    }
  };

  const tsGetType = async () => {
    await reloadFile();
    const args = await getCommonData();
    try {
      const typeInfo = await client.quickInfo(args);
      if (Object.getOwnPropertyNames(typeInfo).length > 0) {
        try {
          showInWindow(typeInfo, 'Type')
        } catch (e) {
          await printHighlight(nvim, await truncateMsg(nvim, typeInfo.displayString), 'MoreMsg', 'Function');
        }
      }
    } catch (err) {
      // console.warn('in catch', JSON.stringify(err));
    }
  };
  const tsTypeDef = async () => {
    await reloadFile();
    const args = await getCommonData();
    const typeDefRes = await client.getTypeDef(args);

    if (typeDefRes && typeDefRes.length > 0) {
      const defFile = typeDefRes[0].file;
      const defLine = typeDefRes[0].start.line;
      const defOffset = typeDefRes[0].start.offset;
      await openBufferOrWindow(defFile, defLine, defOffset);
    }
  };

  const tsImport = async () => {
    await printHighlight(
      nvim,
      'TSImport is depreciated, please use TSGetCodeFix'
    );
    await getCodeFix();
  };

  const tsGetDef = async () => {
    const definition = await getDefFunc();
    if (definition) {
      const defFile = definition[0].file;
      const defLine = definition[0].start.line;
      const defOffset = definition[0].start.offset;
      await openBufferOrWindow(defFile, defLine, defOffset);
    }
  };

  const getDefPreview = async () => {
    const definition = await getDefFunc();
    if (definition) {
      await nvim.command(
        `silent pedit! +${definition[0].start.line} ${definition[0].file}`
      );
      await nvim.command('wincmd P');
    }
  };
  const getDefFunc = async () => {
    await reloadFile();
    const args = await getCommonData();
    return client.getDef(args);
  };

  const tsGetDoc = async () => {
    await reloadFile();
    const args = await getCommonData();
    const info = await client.quickInfo(args);
    if (info) {
      const displayString = info.displayString.split('\n');
      const doc = info.documentation.split('\n');
      const message = displayString.concat(doc);
      await printInSplit(message);
    }
  };

  const tsRename = async (args: string[]) => {
    const symbol = await nvim.eval('expand("<cword>")');

    let newName: string;

    if (args.length > 0) {
      newName = args[0];
    } else {
      const input = await nvim.call('input', [`nvim-ts: rename to `, symbol]);
      if (!input) {
        await printHighlight(nvim, 'Rename canceled', 'ErrorMsg');
        return;
      } else {
        newName = input;
      }
    }
    let changedFiles = [];
    await reloadFile();
    const renameArgs = await getCommonData();
    const buffNum = await nvim.call('bufnr', '%');
    const renameResults = await client.renameSymbol({
      ...renameArgs,
      findInComments: false,
      findInStrings: false,
    });

    if (renameResults) {
      if (isRenameSuccess(renameResults.info)) {
        let changeCount = 0;
        for (let fileLocation of renameResults.locs) {
          let defFile = fileLocation.file;

          if (defFile !== renameArgs.file) {
            await nvim.command(`keepjumps keepalt edit ${defFile}`);
          }
          const commands = [];
          for (let rename of fileLocation.locs.reverse()) {
            let { line, offset } = rename.start;
            const editLine = await nvim.buffer.getLines({
              start: line - 1,
              end: line,
              strictIndexing: true,
            });

            const newLine = editLine[0].replace(symbol as string, newName);
            commands.concat(
              await nvim.buffer.setLines(newLine, {
                start: line - 1,
                end: line,
                strictIndexing: true,
              })
            );

            changedFiles.push({
              filename: defFile,
              lnum: line,
              col: offset,
              text: `Replaced ${symbol} with ${newName}`,
            });

            changeCount += 1;
          }
          await nvim.callAtomic(commands);
        }

        await nvim.command(`buffer ${buffNum}`);
        await nvim.call('cursor', [
          renameResults.info.triggerSpan.start.line,
          renameResults.info.triggerSpan.start.offset,
        ]);

        await createQuickFixList(nvim, changedFiles, 'Renames', false);
        await printHighlight(
          nvim,
          `Replaced ${changeCount} in ${renameResults.locs.length} files`
        );
        await getDiagnostics();
      } else {
        printHighlight(
          nvim,
          renameResults.info.localizedErrorMessage,
          'ErrorMsg'
        );
      }
    }
  };

  const tsGetSig = async () => {
    // console.warn("IMHERE")
    await reloadFile();

    // const file = await getCurrentFile();
    // const [line, offset] = await getCursorPos();
    // const info = await client.getSignature({ file, line, offset });
    // console.warn('INFO', info);

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
    //   printHighlight(nvim, params);
    // }
    // catch (err) {
    //   console.warn('in catch', JSON.stringify(err));
    // }
  };

  const tsRefs = async () => {
    await reloadFile();
    const args = await getCommonData();
    const symbolRefRes = await client.getSymbolRefs(args);

    if (!symbolRefRes || (symbolRefRes && symbolRefRes.refs.length === 0)) {
      printHighlight(nvim, 'References not found', 'ErrorMsg');
      return;
    }

    const refList = symbolRefRes.refs;
    const locationList = refList.map((ref) => {
      return {
        filename: ref.file,
        lnum: ref.start.line,
        col: ref.start.offset,
        text: trim(ref.lineText),
      };
    });
    // Uses QuickFix list as refs can span multiple files. QFList is better.
    createQuickFixList(nvim, locationList, 'References', true);
  };

  const tsEditConfig = async () => {
    await reloadFile();
    const projectInfo = await getProjectInfoFunc();
    if (projectInfo) {
      if (statSync(projectInfo.configFileName).isFile()) {
        nvim.command(`e ${projectInfo.configFileName}`);
      } else {
        printHighlight(
          nvim,
          `Can't edit config, in an inferred project`,
          'ErrorMsg'
        );
      }
    }
  };

  const tsOmniFunc = async (args: [number, string]) => {
    await reloadFile();
    if (!!args[0]) {
      let currentLine = await nvim.line;
      let [, col] = await getCursorPos();
      const lineToCursor = currentLine.substring(0, col);
      let textMatch = await nvim.call('match', [lineToCursor, '\\k*$']);
      return textMatch;
    } else {
      // Args[1] is good.
      return await tsOmniComplete(args[1]);
    }
  };
  const tsOmniComplete = async (args: string) => {
    await reloadFile();
    let file = await getCurrentFile();
    let cursorPos = await nvim.window.cursor;
    let line = cursorPos[0];
    let prefix = args;
    let offset = cursorPos[1] + 1;

    // returns the detailed result as well as sets the vim var
    return complete( file, prefix, offset, line, 'nvim_typescript#completionRes');
  };
  const tsDeoplete = async (args: [string, number]) => {
    reloadFile();
    let file = await getCurrentFile();
    let cursorPos = await nvim.window.cursor;
    let line = cursorPos[0];

    let [prefix, offset] = args;
    // sets the vim var, but doesn't need to return anything
    complete(file, prefix, offset, line, 'nvim_typescript#completion_res');
  };
  const complete = async ( file: string, prefix: string, offset: number, line: number, nvimVar: string) => {
    await closeFloatingWindow();
    // console.warn('didClose', didClose);
    const currentLine = await nvim.line;
    let completeArgs: protocol.CompletionsRequestArgs = {
      file,
      line,
      offset,
      prefix,
      includeInsertTextCompletions: false,
      includeExternalModuleExports: false,
    };
    if (client.isCurrentVersionHighter(300)) {
      completeArgs.triggerCharacter = triggerChar(currentLine);
    }

    let completions: any;
    if (client.isCurrentVersionHighter(300)) {
      try {
        let { isMemberCompletion, entries } = await client.getCompletions( completeArgs);
        // - global completions are sorted by TSServer so that `f` will return a wider set than `foo`
        // - member completions are however returned in a static bunch so that `foo.ba` will return
        //   all members of foo regardless of the prefix.
        // - if there n > maxCompletions members of foo then the code will never make it to the detailed
        //   completions
        // - lets run a regex on the completions so that as the user narrows down the range of possibilities
        //   they will eventually see detailed completions for the member
        completions = isMemberCompletion && prefix ? reduceByPrefix(prefix, entries) : entries;

      }
      catch(e){
        await nvim.setVar(nvimVar, []);
        return [];

      }
    }
    else {
      try {
        completions = await client.getCompletions(completeArgs);
      }
      catch(e){

        await nvim.setVar(nvimVar, []);
        return [];
      }
    }
    if (completions.length > 0) {
      if (completions.length > maxCompletion) {
        let completionRes = await Promise.all(
          completions.map(
            async (entry: protocol.CompletionEntry) =>
              await convertEntry(nvim, entry)
          )
        );
        await nvim.setVar(nvimVar, completionRes);
        return completionRes;
      }
      else {
        const entryNames = completions.map((v: { name: any }) => v.name);
        let detailedCompletions = await client.getCompletionDetails({
          file,
          line,
          offset,
          entryNames,
        });
        // console.warn(JSON.stringify(detailedCompletions));
        let completionResDetailed = await Promise.all(
          detailedCompletions.map(
            async (entry) =>
              await convertDetailEntry(nvim, entry, expandSnippet)
          )
        );

        await nvim.setVar(nvimVar, completionResDetailed);
        return completionResDetailed;
      }
    }
    else {
      await nvim.setVar(nvimVar, []);
      return [];
    }
  };

  const tsGetdocsymbols = async () => {
    const file = await getCurrentFile();
    const docSysmbols = await getDocSymbolsFunc();
    let docSysmbolsLoc = [];
    const symbolList = docSysmbols.childItems;
    if (symbolList.length > 0) {
      for (let symbol of symbolList) {
        docSysmbolsLoc.push({
          filename: file,
          lnum: symbol.spans[0].start.line,
          col: symbol.spans[0].start.offset,
          text: symbol.text,
        });
        if (symbol.childItems && symbol.childItems.length > 0) {
          for (let childSymbol of symbol.childItems) {
            docSysmbolsLoc.push({
              filename: file,
              lnum: childSymbol.spans[0].start.line,
              col: childSymbol.spans[0].start.offset,
              text: childSymbol.text,
            });
          }
        }
      }
      createLocList(nvim, docSysmbolsLoc, 'Symbols');
    }
  };
  const getDocSymbolsFunc = async () => {
    await reloadFile();
    const file = await getCurrentFile();
    const symbols = await client.getDocumentSymbols({ file });
    // console.warn(JSON.stringify(symbols));
    return symbols;
  };

  const getWorkspaceSymbols = async (args: any[]) => {
    await reloadFile();
    const file = await getCurrentFile();
    const funcArgs = [...args, file];

    const results = await getWorkspaceSymbolsFunc(funcArgs);
    if (results) {
      await createLocList(nvim, results, 'WorkspaceSymbols');
    }
  };

  const getWorkspaceSymbolsFunc = async (args: any[]) => {
    const searchValue = args.length > 0 ? args[0] : '';
    const maxResultCount = 50;
    const results = await client.getWorkspaceSymbols({
      file: args[1],
      searchValue,
      maxResultCount,
    });

    const symbolsRes = await Promise.all(
      results.map(async (symbol) => {
        return {
          filename: symbol.file,
          lnum: symbol.start.line,
          col: symbol.start.offset,
          text: `${await getKind(nvim, symbol.kind)}\t ${symbol.name}`,
        };
      })
    );

    return symbolsRes;
  };

  const organizeImports = async () => {
    await reloadFile();
    const file = await getCurrentFile();
    const scopes = await client.getOrganizedImports({
      scope: {
        type: 'file',
        args: { file },
      },
    });
    if (scopes) {
      await applyCodeFixes(scopes, nvim);
    } else {
      printHighlight(nvim, 'No changes needed');
    }
  };

  const getDiagnostics = async () => {
    if (enableDiagnostics) {
      // console.warn('GETTING DiagnosticHost');
      await reloadFile();
      const file = await getCurrentFile();
      const sematicErrors = await getSematicErrors(file);
      const syntaxErrors = await getSyntaxErrors(file);
      let res = [...sematicErrors, ...syntaxErrors];
      if (suggestionsEnabled) {
        const suggestionErrors = await getSuggested(file);
        res = [...res, ...suggestionErrors];
      }
      await diagnosticHost.placeSigns(res, file);
      await closeFloatingWindow();
      await handleCursorMoved();
    }
  };

  const getProjectInfoFunc = async () => {
    const file = await getCurrentFile();
    return await client.getProjectInfo({ file, needFileNameList: true });
  };

  const closeFloatingWindow = async () => {
    try {
      await windowRef.close(true);
      windowRef = null
    } catch (error) {}
    return;
  };

  const handleCursorMoved = async () => {
    const buftype = await nvim.eval('&buftype');
    if (buftype !== '') return;

    const { file, line, offset } = await getCommonData();
    const errorSign = diagnosticHost.getSign(file, line, offset);

    if (errorSign) {
      debounce(async () => {
        // print(nvim,`ERROR${JSON.stringify(errorSign)}`);
        await showInWindow(errorSign, 'Error');
      }, updateTime + 200)();
    }
  };

  const getErrFull = async () => {
    const { file, line, offset } = await getCommonData();
    const buftype = await nvim.eval('&buftype');
    if (buftype !== '') return;
    const errorSign = diagnosticHost.getSign(file, line, offset);
    if (errorSign) {
      await printInSplit(errorSign.text, '__error__');
    }
  };

  const printInSplit = async ( message: string | string[], bufname = '__doc__') => {
    const buf: number = await nvim.call('bufnr', bufname);

    if (buf > 0) {
      const pageNr = await nvim.tabpage.number;
      const pageList: number[] = await nvim.call('tabpagebuflist', pageNr);
      const wi: number = await nvim.call(`index`, [pageList, buf]);
      if (wi > 0) {
        await nvim.command(`${wi + 1} wincmd w`);
      } else {
        await nvim.command(`sbuffer ${buf}`);
      }
    } else {
      await nvim.command('botright 10split __doc__');
    }
    await nvim.callAtomic([
      await nvim.buffer.setOption('modifiable', true),
      await nvim.command('sil normal! ggdG'),
      await nvim.command('resize 10'),
      await nvim.buffer.setOption('swapfile', false),
      await nvim.window.setOption('number', false),
      await nvim.buffer.setOption('buftype', 'nofile'),
      await nvim.buffer.insert(message, 0),
      await nvim.command('sil normal! gg'),
      await nvim.buffer.setOption('modifiable', false),
    ]);
  };

  const getCodeFix = async () => {
    await reloadFile();
    const { file, line, offset } = await getCommonData();
    const errorAtCursor = diagnosticHost.getSign(file, line, offset);
    if (errorAtCursor) {
      // scope: {
      //   type: 'file',
      //   args: { file }
      // }
      // const combinedFixes = await client.getCombinedCodeFix(
      //   {
      //   scope: { type: 'file', args: {file} },
      //   fixId: {}});
      //   console.warn('COMBO FIXES: ', JSON.stringify(combinedFixes))

      const fixes = await client.getCodeFixes({
        file,
        startLine: errorAtCursor.start.line,
        startOffset: errorAtCursor.start.offset,
        endLine: errorAtCursor.end.line,
        endOffset: errorAtCursor.end.offset,
        errorCodes: [errorAtCursor.code],
      });
      if (fixes.length !== 0) {
        const promptSel = await promptForSelection(fixes, nvim);
        await diagnosticHost.clearAllHighlights(file);
        await applyCodeFixes(promptSel, nvim);
        await getDiagnostics();
      } else {
        await printHighlight(nvim, 'No fix');
      }
    }
  };

  const onCMRefresh = async (args: any[]) => {
    const info = args[0];
    const ctx = args[1];

    const line = ctx['lnum'];
    const offset = ctx['col'];
    const prefix = ctx['base'];
    const startcol = ctx['startcol'];
    // recheck
    if (await nvim.call('cm#context_changed', ctx)) return;
    await reloadFile();
    const file = await getCurrentFile();
    const data = await client.getCompletions({
      file,
      line,
      offset,
      prefix,
      includeInsertTextCompletions: false,
      includeExternalModuleExports: false,
    });
    if (data.entries.length === 0) return [];

    if (data.entries.length > maxCompletion) {
      const completions = await Promise.all(
        data.entries.map(async (entry) => await convertEntry(nvim, entry))
      );
      await nvim.call('cm#complete', [info, ctx, startcol, completions]);
      return;
    }

    let entryNames = data.entries.map((v) => v.name);
    const detailedCompletions = await client.getCompletionDetails({
      file,
      line,
      offset,
      entryNames,
    });
    const detailedEntries = await Promise.all(
      detailedCompletions.map(
        async (entry) => await convertDetailEntry(nvim, entry)
      )
    );
    await nvim.call('cm#complete', [info, ctx, startcol, detailedEntries]);
  };

  const onNcm2Complete = async (args: any[]) => {
    const ctx = args[0];

    const line = ctx['lnum'];
    const offset = ctx['ccol'];
    const prefix = ctx['base'];
    const startccol = ctx['startccol'];
    await reloadFile();
    const file = await getCurrentFile();
    const data = await client.getCompletions({
      file,
      line,
      offset,
      prefix,
      includeInsertTextCompletions: false,
      includeExternalModuleExports: false,
    });
    if (data.entries.length === 0) return [];

    if (data.entries.length > maxCompletion) {
      const completions = await Promise.all(
        data.entries.map(async (entry) => await convertEntry(nvim, entry))
      );
      await nvim.call('ncm2#complete', [ctx, startccol, completions]);
      return;
    }

    let entryNames = data.entries.map((v) => v.name);
    const detailedCompletions = await client.getCompletionDetails({
      file,
      line,
      offset,
      entryNames,
    });
    const detailedEntries = await Promise.all(
      detailedCompletions.map(
        async (entry) => await convertDetailEntry(nvim, entry)
      )
    );
    await nvim.call('ncm2#complete', [ctx, startccol, detailedEntries]);
  };

  plugin.registerCommand('TSRename',                    tsRename,                { nargs: '*' });
  plugin.registerCommand('TSGetWorkspaceSymbols',       getWorkspaceSymbols,     { nargs: '*', });
  plugin.registerCommand('TSSig',                       tsGetSig);
  plugin.registerCommand('TSDefPreview',                getDefPreview);
  plugin.registerCommand('TSDoc',                       tsGetDoc);
  plugin.registerCommand('TSDef',                       tsGetDef);
  plugin.registerCommand('TSImport',                    tsImport);
  plugin.registerCommand('TSRefs',                      tsRefs);
  plugin.registerCommand('TSEditConfig',                tsEditConfig);
  plugin.registerCommand('TSStart',                     tsstart);
  plugin.registerCommand('TSStop',                      tsstop);
  plugin.registerCommand('TSReloadProject',             reloadProject);
  plugin.registerCommand('TSBuild',                     tsBuild);
  plugin.registerCommand('TSTypeDef',                   tsTypeDef);
  plugin.registerCommand('TSType',                      tsGetType);
  plugin.registerCommand('TSGetDocSymbols',             tsGetdocsymbols);
  plugin.registerCommand('TSOrganizeImports',           organizeImports);
  plugin.registerCommand('TSGetDiagnostics',            getDiagnostics);
  plugin.registerCommand('TSGetErrorFull',              getErrFull);
  plugin.registerCommand('TSGetCodeFix',                getCodeFix);

  plugin.registerFunction('TSGetProjectInfoFunc',       getProjectInfoFunc,      { sync: true, });
  plugin.registerFunction('TSGetWorkspaceSymbolsFunc',  getWorkspaceSymbolsFunc, { sync: true });
  plugin.registerFunction('TSGetDocSymbolsFunc',        getDocSymbolsFunc,       { sync: true, });
  plugin.registerFunction('TSDeoplete',                 tsDeoplete,              { sync: false });
  plugin.registerFunction('TSOmniFunc',                 tsOmniFunc,              { sync: true });
  plugin.registerFunction('TSGetServerPath',            tsGetServerPath,         { sync: true });
  plugin.registerFunction('TSGetVersion',               tsGetVersion,            { sync: true });
  plugin.registerFunction('TSNcm2OnComplete',           onNcm2Complete);
  plugin.registerFunction('TSCmRefresh',                onCMRefresh);
  plugin.registerFunction('TSCloseWindow',              closeFloatingWindow);
  plugin.registerFunction('TSEchoMessage',              handleCursorMoved);
  plugin.registerFunction('TSOnBufEnter',               onBufEnter);
  plugin.registerFunction('TSOnBufLeave',               onBufLeave);
  plugin.registerFunction('TSOnBufSave',                onBufSave);
};

module.exports.default = module.exports;
