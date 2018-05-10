import { execSync } from "child_process";
import * as fs from "fs";
import { Autocmd, Command, Function, Plugin, Neovim } from "neovim";
import { fileSync } from "tmp";
import protocol from "typescript/lib/protocol";
import { Client } from "./client";
import {
  trim,
  convertToDisplayString,
  getParams,
  getCurrentImports,
  getImportCandidates,
  convertDetailEntry,
  convertEntry
} from "./utils";

@Plugin({ dev: true })
export default class TSHost {
  private nvim: Neovim;
  private client = Client;
  private maxCompletion: number;
  last_input_reload = new Date().getTime();

  private reloadInterval = 1;

  constructor(nvim) {
    this.nvim = nvim;
    this.nvim
      .getVar("nvim_typescript#max_completion_detail")
      .then(res => (this.maxCompletion = parseFloat(res)));
    this.nvim
      .getVar("nvim_typescript#server_path")
      .then(val => this.client.setServerPath(val));
  }
  // init
  // TODO: Fix setting channel number
  // @Function('nvim_typescript_init')
  // async initNode() {
  //   this.maxCompletion = parseInt(await this.nvim.getVvar("nvim_typescript#max_completion_detail"), 10)
  //   console.log(this.maxCompletion)
  //   //   this.nvim.setVar(name, this.nvim._cha)
  //   //     this._nvim.setVar('nvim_typescript#channel_id', this._nvim._channel_id)
  // }

  // LangServer Commands
  @Command("TSType")
  public async getType() {
    const reloadResults = await this.reloadFile();
    const args = await this.getCommonData();
    this.client.quickInfo(args).then(
      typeInfo => {
        this.nvim.outWrite(`${typeInfo.displayString} \n`);
      },
      err => this.printErr("No type information for symbol")
    );
  }

  @Command("TSTypeDef")
  async tstypedef() {
    await this.reloadFile();
    const args = await this.getCommonData();
    const typeDefRes = await this.client.getTypeDef(args);
    console.debug(typeDefRes);

    if (typeDefRes && typeDefRes.length > 0) {
      const defFile = typeDefRes[0].file;
      const defLine = typeDefRes[0].start.line;
      this.nvim.command(`e +${defLine} ${defFile}`);
    }
  }

  // @ts_check_server()
  // @ts_version_support(216)
  @Command("TSImport")
  async tsImport() {
    await this.reloadFile();
    const file = await this.getCurrentFile();
    const symbol = await this.nvim.call("expand", "<cword>");
    const [line, col] = await this.getCursorPos();
    const cursorPosition = { line, col };

    const currentlyImportedItems = await getCurrentImports(this.client, file);
    if ((currentlyImportedItems as Array<string>).includes(symbol)) {
      this.printMsg(`${symbol} is already imported`);
    }
    const results = await getImportCandidates(
      this.client,
      file,
      cursorPosition
    );
    let fixes;
    // # No imports
    if (results.length === 0) {
      this.printMsg("No imports canidates were found.");
    }
    if (results.length === 1) {
      fixes = results[0].changes;
    } else {
      const changeDescriptions = results.map(change => change.description);
      const canidates = changeDescriptions.map((change, idx) => {
        return `\n[${idx}]: ${change}`;
      });
      const input = await this.nvim.call(
        "input", `nvim-ts: More than 1 candidate found, Select from the following options:\n" ${canidates} please choose one: `
      );

      if (!input) {
        this.printErr("Inport canceled");
        return;
      }
      if (parseInt(input) > results.length - 1) {
        this.printErr("Selection not valid");
        return;
      } else {
        fixes = results[parseInt(input)].changes;
      }
    }
    this.applyImportChanges(fixes);
  }
  async applyImportChanges(fixes: protocol.FileCodeEdits[]) {
    // console.log("fixes", JSON.stringify(fixes));
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
          ""
        );
        if (changeOffset === 1) {
          await this.nvim.buffer.insert(newText, changeLine);
        } else if (addingNewLine) {
          console.log("here?");
          await this.nvim.buffer.insert(newText, changeLine + 1);
        } else {
          console.log("in else");
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
            console.log("nothing to see here boys...");
          } else {
            // console.log(changeLine);
            // console.log(changeOffset);
            // console.log(newText);
            // console.log(linesToChange);
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
  }

  @Command("TSSig")
  public async getSig() {
    await this.reloadFile();
    const args = await this.getCommonData();

    this.client
      .quickInfo(args)
      .then(
        sigRes =>
          this.nvim.command(
            `redraws! | echom "nvim-ts: " | echohl Function | echon \"${
            sigRes.displayString
            } \" | echohl None`
          ),
        err => this.printErr("No signature")
      );
  }

  @Command("TSDef")
  public async getDef() {
    this.getDefFunc().then(
      defRes => {
        this.nvim.command(`e +${defRes[0].start.line} ${defRes[0].file}`);
      },
      err => this.printErr("No definition for symbol")
    );
  }
  @Command("TSDefPreview")
  public async getDefPreview() {
    this.getDefFunc().then(
      defRes => {
        this.nvim.command(`split! +${defRes[0].start.line} ${defRes[0].file}`);
      },
      err => this.printErr("No definition for symbol")
    );
  }
  public async getDefFunc() {
    await this.reloadFile();
    const args = await this.getCommonData();
    return this.client.getDef(args);
  }

  @Command('TSDoc')
  public async getDoc() {
    await this.reloadFile()
    const args = await this.getCommonData();
    const info = await this.client.quickInfo(args);
    if (info) {
      const displayString = info.displayString.split('\n');
      const doc = info.documentation.split('\n');
      const message = displayString.concat(doc)
      const buf = await this.nvim.call('bufnr', '__doc__');
      if (buf > 0) {
        const pageNr = await this.nvim.tabpage.number;
        const pageList: number[] = await this.nvim.call('tabpagebuflist', pageNr);
        const wi = await this.nvim.call(`index`, [pageList, buf]);
        if (wi > 0) {
          await this.nvim.command(`${wi + 1} wincmd w`);
        } else {
          await this.nvim.command(`sbuffer ${buf}`);
        }
      }
      else {
        await this.nvim.command("split __doc__")
      }
      for (let setting of [
        "setlocal modifiable",
        "setlocal noswapfile",
        "setlocal nonumber",
        "setlocal buftype=nofile"
      ]) {
        await this.nvim.command(setting);
      }
      await this.nvim.command('sil normal! ggdG')
      await this.nvim.command('resize 10')
      await this.nvim.buffer.insert(message, 0)
      await this.nvim.command("setlocal nomodifiable")
      await this.nvim.command('sil normal! gg')
    }

  }

  @Command("TSRename", { nargs: "*" })
  async tsRename(args) {
    const symbol = await this.nvim.eval('expand("<cword>")');
    const newName =
      args.length > 0
        ? args[0]
        : await this.nvim.call("input", `nvim-ts: rename ${symbol} to `);

    await this.reloadFile();
    const renameArgs = await this.getCommonData();
    const renameResults = await this.client.renameSymbol({
      ...renameArgs,
      findInComments: false,
      findInStrings: false
    });
    if (renameResults) {
      if (renameResults.info.canRename) {
        let changeCount = 0;
        for (let loc of renameResults.locs) {
          for (let rename of loc.locs) {
            console.log(rename);
            await this.nvim.callFunction("cursor", [
              rename.start.line,
              rename.start.offset
            ]);
            await this.nvim.command(`normal cw${newName}`);
            changeCount += 1;
          }
        }
        await this.nvim.callFunction("cursor", [
          renameArgs.line,
          renameArgs.offset
        ]);
        this.printMsg(
          `Replaced ${changeCount} in ${renameResults.locs.length} files`
        );
      }
    }
  }

  @Command("TSSig")
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

  @Command("TSRefs")
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
      this.createLocList(locationList, "References");
    }
    {
      this.printErr("References not found");
    }
  }

  @Command("TSEditConfig")
  async tsEditconfig(self) {
    await this.reloadFile();
    const projectInfo = await this.getProjectInfoFunc();
    if (projectInfo) {
      if (fs.statSync(projectInfo.configFileName).isFile()) {
        this.nvim.command(`e ${projectInfo.configFileName}`);
      } else {
        this.printErr(`Can't edit config, in an inferred project`);
      }
    }
  }

  //Omni functions
  @Function("TSOmnicFunc", { sync: true })
  async getCompletions(args) {
    console.log("calling omni", args);
    if (!!args[0]) {
      let currentLine = await this.nvim.line;
      let [line, col] = await this.getCursorPos();
      let start = col - 1;
      while (start >= 0 && currentLine[start - 1].match(/[a-zA-Z_0-9$]/)) {
        start--;
      }
      return start;
    }
    // Args[1] is good.
    else {
      return await this.tsComplete(args[1]);
    }
  }

  @Function("TSComplete", { sync: true })
  async tsComplete(args: string | [string, number]) {
    console.log(args);
    await this.reloadFile();
    let file = await this.getCurrentFile();
    let cursorPos = await this.nvim.window.cursor;
    let line = cursorPos[0];
    let offset, prefix;
    if (typeof args === "string") {
      prefix = args;
      offset = cursorPos[1] + 1;
    } else {
      prefix = args[0];
      offset = args[1];
    }

    // console.log(line, offset, args);
    let completions = await this.client.getCompletions({
      file,
      line,
      offset,
      prefix
    });
    // console.log("completion: ", completions);
    // K, we got our first set of completion data, now lets sort...
    // console.log(completions.length)
    if (completions.length > this.maxCompletion) {
      return completions.map(v => convertEntry(v));
    }
    let entryNames = completions.map(v => v.name);
    let detailedCompletions = await this.client.getCompletionDetails({
      file,
      line,
      offset,
      entryNames
    });
    return detailedCompletions.map(v => convertDetailEntry(v));
  }

  //Display Doc symbols in loclist
  @Command("TSGetDocSymbols")
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
      this.createLocList(docSysmbolsLoc, "Symbols");
    }
  }

  @Function("TSGetDocSymbolsFunc", { sync: true })
  async getdocsymbolsFunc() {
    await this.reloadFile();
    const file = await this.getCurrentFile();
    return await this.client.getDocumentSymbols({ file });
  }

  @Command("TSGetWorkspaceSymbols", { nargs: "*" })
  async getWorkspaceSymbols(args) {
    await this.reloadFile();
    const results = await this.getWorkspaceSymbolsFunc(args);
    if (results) {
      const symbolsRes = results.map(symbol => {
        return {
          filename: symbol.file,
          lnum: symbol.start.line,
          col: symbol.start.offset,
          text: `${symbol.name} - ${symbol.kind}`
        };
      });
      await this.createLocList(symbolsRes, "WorkspaceSymbols");
    }
  }

  @Function("TSGetWorkspaceSymbolsFunc", { sync: true })
  async getWorkspaceSymbolsFunc(args) {
    console.log(args);
    const file = await this.getCurrentFile();
    const searchValue = args.length > 0 ? args[0] : "";
    const maxResultCount = 50;
    return await this.client.getWorkspaceSymbols({
      file: file,
      searchValue: searchValue,
      maxResultCount: 50
    });
    // console.log(args[0])
  }

  @Function("TSGetProjectInfoFunc", { sync: true })
  async getProjectInfoFunc() {
    const file = await this.getCurrentFile();
    return await this.client.getProjectInfo({ file, needFileNameList: true });
  }

  async createLocList(
    list: Array<{ filename: string; lnum: number; col: number; text: string }>,
    title: string
  ) {
    return new Promise(async (resolve, reject) => {
      await this.nvim.call("setloclist", [0, list, "r", title]);
      await this.nvim.command("lwindow");
      resolve();
    });
  }

  //SERVER Utils

  @Function("TSGetServerPath", { sync: true })
  tsGetServerPath() {
    // Get the path of the tsserver
    return this.client.serverPath;
  }

  @Function("TSGetVersion", { sync: true })
  tsGetVersion(self, args) {
    return this.client.tsConfigVersion;
  }

  // autocmd function syncs
  @Function("TSOnBufEnter")
  public async onBufEnter() {
    if (this.client.serverHandle == null) {
      this.client.setTSConfigVersion();
      await this.tsstart();
    } else {
      const file = await this.getCurrentFile();
      await this.client.openFile({ file });
    }
  }

  @Function("TSOnBufSave")
  public async onBufSave() {
    await this.reloadFile();
  }

  // Life cycle events
  @Command("TSStart", {})
  public async tsstart() {
    if (this.client.serverHandle === null) {
      await this.client.startServer();
      this.nvim.outWrite(`nvim-ts: Server started \n`);
      const file = await this.getCurrentFile();
      await this.client.openFile({ file });
    } else {
      console.log("server is running");
      const file = await this.getCurrentFile();
      await this.client.openFile({ file });
    }
  }

  @Command("TSStop")
  public tsstop() {
    if (this.client.serverHandle != null) {
      this.client.stopServer();
      this.nvim.outWrite(`nvim-ts: Server Stopped \n`);
    }
  }

  @Command("TSReloadProject")
  public async reloadProject() {
    await this.client.reloadProject();
  }

  // Utils
  // TODO: Extract to own file
  public async printErr(message: string) {
    await this.nvim.errWrite(`nvim-ts: ${message} \n`);
  }
  public async printMsg(message: string) {
    await this.nvim.outWrite(`nvim-ts: ${message} \n`);
  }

  async printHighlight(message) {
    await this.nvim.command(
      `redraws! | echom "nvim-ts: " | echohl Function | echon "${message}" | echohl None`
    );
  }

  public async reloadFile(): Promise<any> {
    return new Promise(async (resolve, reject) => {
      const file = await this.getCurrentFile();
      const contents = (await this.nvim.buffer.lines).join("\n");
      console.debug("FILE", file);
      const temp = fileSync();
      fs.writeFileSync(temp.name, contents, "utf8");
      return this.client
        .updateFile({ file, tmpfile: temp.name })
        .then(res => resolve(res));
    });
  }
  public async getCurrentFile(): Promise<string> {
    return await this.nvim.buffer.name;
  }
  public async getCursorPos(): Promise<[number, number]> {
    return await this.nvim.window.cursor;
  }
  public async getCommonData(): Promise<{
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

  public log(message: any) {
    this.nvim.outWrite(`${message} \n`);
  }
}
