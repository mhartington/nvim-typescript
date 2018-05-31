"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : new P(function (resolve) { resolve(result.value); }).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
Object.defineProperty(exports, "__esModule", { value: true });
const neovim_1 = require("neovim");
const tmp_1 = require("tmp");
const client_1 = require("./client");
const utils_1 = require("./utils");
const fs_1 = require("fs");
let TSHost = class TSHost {
    constructor(nvim) {
        this.client = client_1.Client;
        this.nvim = nvim;
        this.nvim
            .getVar('nvim_typescript#max_completion_detail')
            .then((res) => (this.maxCompletion = parseFloat(res)));
        this.nvim
            .getVar('nvim_typescript#server_path')
            .then((val) => this.client.setServerPath(val));
        this.nvim
            .getVar('nvim_typescript#server_options')
            .then((val) => (this.client.serverOptions = val));
    }
    getType() {
        return __awaiter(this, void 0, void 0, function* () {
            const reloadResults = yield this.reloadFile();
            const args = yield this.getCommonData();
            const typeInfo = yield this.client.quickInfo(args);
            if (typeInfo) {
                yield this.printMsg(`${typeInfo.displayString.replace(/(\r\n|\n|\r)/gm, '')}`);
            }
        });
    }
    tstypedef() {
        return __awaiter(this, void 0, void 0, function* () {
            yield this.reloadFile();
            const args = yield this.getCommonData();
            const typeDefRes = yield this.client.getTypeDef(args);
            console.debug(typeDefRes);
            if (typeDefRes && typeDefRes.length > 0) {
                const defFile = typeDefRes[0].file;
                const defLine = typeDefRes[0].start.line;
                const defOffset = typeDefRes[0].start.offset;
                yield this.openBufferOrWindow(defFile, defLine, defOffset);
            }
        });
    }
    tsImport() {
        return __awaiter(this, void 0, void 0, function* () {
            yield this.reloadFile();
            const file = yield this.getCurrentFile();
            const symbol = yield this.nvim.call('expand', '<cword>');
            const [line, col] = yield this.getCursorPos();
            const cursorPosition = { line, col };
            const currentlyImportedItems = yield utils_1.getCurrentImports(this.client, file);
            if (currentlyImportedItems.includes(symbol)) {
                yield this.printMsg(`${symbol} is already imported`);
            }
            const results = yield utils_1.getImportCandidates(this.client, file, cursorPosition);
            let fixes;
            // No imports
            if (!results.length) {
                return this.printMsg('No imports canidates were found.');
            }
            else if (results.length === 1) {
                fixes = results[0].changes;
            }
            else {
                const changeDescriptions = results.map(change => change.description);
                const canidates = changeDescriptions.map((change, idx) => `\n[${idx}]: ${change}`);
                const input = yield this.nvim.call('input', `nvim-ts: More than 1 candidate found, Select from the following options: \n${canidates} \nplease choose one: `);
                if (!input) {
                    yield this.printErr('Inport canceled');
                    return;
                }
                if (parseInt(input) > results.length - 1) {
                    yield this.printErr('Selection not valid');
                    return;
                }
                else {
                    fixes = results[parseInt(input)].changes;
                }
            }
            this.applyImportChanges(fixes);
        });
    }
    applyImportChanges(fixes) {
        return __awaiter(this, void 0, void 0, function* () {
            for (let fix of fixes) {
                for (let change of fix.textChanges) {
                    const changeLine = change.start.line - 1;
                    const changeOffset = change.start.offset;
                    const leadingNewLineRexeg = /^\n/;
                    const leadingAndTrailingNewLineRegex = /^\n|\n$/;
                    const addingNewLine = change.newText.match(leadingNewLineRexeg)
                        ? true
                        : false;
                    const newText = change.newText.replace(leadingAndTrailingNewLineRegex, '');
                    if (changeOffset === 1) {
                        console.log('changOffset === 1');
                        yield this.nvim.buffer.insert(newText, changeLine);
                    }
                    else if (addingNewLine) {
                        console.log('adding new line');
                        yield this.nvim.buffer.insert(newText, changeLine + 1);
                    }
                    else {
                        const addingTrailingComma = newText.match(/^,$/) ? true : false;
                        const linesToChange = yield this.nvim.buffer.getLines({
                            start: changeLine,
                            end: changeLine + 1,
                            strictIndexing: true
                        });
                        const lineAlreadyHasTrailingComma = linesToChange[0].match(/^.*,\s*$/)
                            ? true
                            : false;
                        if (addingTrailingComma && lineAlreadyHasTrailingComma) {
                            console.log('nothing to see folks');
                        }
                        else {
                            console.log('no trailing comma, and line has no trailing comma');
                            yield this.nvim.buffer.setLines(`${linesToChange[0].substring(changeOffset - 1, 0)}${newText}${linesToChange[0].substring(changeOffset - 1)} `, { start: changeLine, end: changeLine + 1, strictIndexing: true });
                        }
                    }
                }
            }
            yield this.printMsg('Import applied');
        });
    }
    getSig() {
        return __awaiter(this, void 0, void 0, function* () {
            yield this.reloadFile();
            const args = yield this.getCommonData();
            const signature = yield this.client.quickInfo(args);
            if (signature) {
                yield this.printHighlight(signature.displayString);
            }
        });
    }
    getDef() {
        return __awaiter(this, void 0, void 0, function* () {
            const definition = yield this.getDefFunc();
            if (definition) {
                const defFile = definition[0].file;
                const defLine = definition[0].start.line;
                const defOffset = definition[0].start.offset;
                yield this.openBufferOrWindow(defFile, defLine, defOffset);
            }
        });
    }
    getDefPreview() {
        return __awaiter(this, void 0, void 0, function* () {
            const definition = yield this.getDefFunc();
            if (definition) {
                this.nvim.command(`split! +${definition[0].start.line} ${definition[0].file}`);
            }
        });
    }
    getDefFunc() {
        return __awaiter(this, void 0, void 0, function* () {
            yield this.reloadFile();
            const args = yield this.getCommonData();
            return this.client.getDef(args);
        });
    }
    getDoc() {
        return __awaiter(this, void 0, void 0, function* () {
            yield this.reloadFile();
            const args = yield this.getCommonData();
            const info = yield this.client.quickInfo(args);
            if (info) {
                const displayString = info.displayString.split('\n');
                const doc = info.documentation.split('\n');
                const message = displayString.concat(doc);
                const buf = yield this.nvim.call('bufnr', '__doc__');
                if (buf > 0) {
                    const pageNr = yield this.nvim.tabpage.number;
                    const pageList = yield this.nvim.call('tabpagebuflist', pageNr);
                    const wi = yield this.nvim.call(`index`, [pageList, buf]);
                    if (wi > 0) {
                        yield this.nvim.command(`${wi + 1} wincmd w`);
                    }
                    else {
                        yield this.nvim.command(`sbuffer ${buf}`);
                    }
                }
                else {
                    yield this.nvim.command('split __doc__');
                }
                for (let setting of [
                    'setlocal modifiable',
                    'setlocal noswapfile',
                    'setlocal nonumber',
                    'setlocal buftype=nofile'
                ]) {
                    yield this.nvim.command(setting);
                }
                yield this.nvim.command('sil normal! ggdG');
                yield this.nvim.command('resize 10');
                yield this.nvim.buffer.insert(message, 0);
                yield this.nvim.command('setlocal nomodifiable');
                yield this.nvim.command('sil normal! gg');
            }
        });
    }
    tsRename(args) {
        return __awaiter(this, void 0, void 0, function* () {
            const symbol = yield this.nvim.eval('expand("<cword>")');
            let newName;
            if (args.length > 0) {
                newName = args[0];
            }
            else {
                const input = yield this.nvim.call('input', `nvim-ts: rename ${symbol} to `);
                if (!input) {
                    yield this.printErr('Rename canceled');
                    return;
                }
                else {
                    newName = input;
                }
            }
            yield this.reloadFile();
            const renameArgs = yield this.getCommonData();
            const buffNum = yield this.nvim.call('bufnr', '%');
            const renameResults = yield this.client.renameSymbol(Object.assign({}, renameArgs, { findInComments: false, findInStrings: false }));
            if (renameResults) {
                if (renameResults.info.canRename) {
                    let changeCount = 0;
                    for (let fileLocation of renameResults.locs) {
                        let defFile = fileLocation.file;
                        yield this.nvim.command(`e! ${defFile}`);
                        for (let rename of fileLocation.locs) {
                            let { line, offset } = rename.start;
                            let substitutions = `${line}substitute/\\%${offset}c${symbol}/${newName}/`;
                            yield this.nvim.command(substitutions);
                            changeCount += 1;
                        }
                    }
                    yield this.nvim.command(`buffer ${buffNum}`);
                    yield this.nvim.call('cursor', [renameArgs.line, renameArgs.offset]);
                    this.printMsg(`Replaced ${changeCount} in ${renameResults.locs.length} files`);
                }
            }
            else {
                this.printErr(renameResults.info.localizedErrorMessage);
            }
        });
    }
    tssig() {
        return __awaiter(this, void 0, void 0, function* () {
            yield this.reloadFile();
            const file = yield this.getCurrentFile();
            const [line, offset] = yield this.getCursorPos();
            this.client.getSignature({ file, line, offset }).then(info => {
                const signatureHelpItems = info.items.map(item => {
                    return {
                        variableArguments: item.isVariadic,
                        prefix: utils_1.convertToDisplayString(item.prefixDisplayParts),
                        suffix: utils_1.convertToDisplayString(item.suffixDisplayParts),
                        separator: utils_1.convertToDisplayString(item.separatorDisplayParts),
                        parameters: item.parameters.map(p => {
                            return {
                                text: utils_1.convertToDisplayString(p.displayParts),
                                documentation: utils_1.convertToDisplayString(p.documentation)
                            };
                        })
                    };
                });
                console.log(signatureHelpItems);
                const params = utils_1.getParams(signatureHelpItems[0].parameters, signatureHelpItems[0].separator);
                // this.printHighlight(params);
            }, err => this.printErr(err));
        });
    }
    tsRefs() {
        return __awaiter(this, void 0, void 0, function* () {
            yield this.reloadFile();
            const args = yield this.getCommonData();
            const symbolRefRes = yield this.client.getSymbolRefs(args);
            if (symbolRefRes && symbolRefRes.refs.length > 0) {
                const refList = symbolRefRes.refs;
                const locationList = refList.map(ref => {
                    return {
                        filename: ref.file,
                        lnum: ref.start.line,
                        col: ref.start.offset,
                        text: utils_1.trim(ref.lineText)
                    };
                });
                this.createLocList(locationList, 'References');
            }
            {
                this.printErr('References not found');
            }
        });
    }
    tsEditconfig(self) {
        return __awaiter(this, void 0, void 0, function* () {
            yield this.reloadFile();
            const projectInfo = yield this.getProjectInfoFunc();
            if (projectInfo) {
                if (fs_1.statSync(projectInfo.configFileName).isFile()) {
                    this.nvim.command(`e ${projectInfo.configFileName}`);
                }
                else {
                    this.printErr(`Can't edit config, in an inferred project`);
                }
            }
        });
    }
    //Omni functions
    getCompletions(args) {
        return __awaiter(this, void 0, void 0, function* () {
            if (!!args[0]) {
                let currentLine = yield this.nvim.line;
                let [line, col] = yield this.getCursorPos();
                let start = col - 1;
                while (start >= 0 && currentLine[start - 1].match(/[a-zA-Z_0-9$]/)) {
                    start--;
                }
                return start;
            }
            else {
                // Args[1] is good.
                return yield this.tsComplete(args[1]);
            }
        });
    }
    tsComplete(args) {
        return __awaiter(this, void 0, void 0, function* () {
            yield this.reloadFile();
            let file = yield this.getCurrentFile();
            let cursorPos = yield this.nvim.window.cursor;
            let line = cursorPos[0];
            let offset, prefix;
            if (typeof args === 'string') {
                prefix = args;
                offset = cursorPos[1] + 1;
            }
            else {
                prefix = args[0];
                offset = args[1];
            }
            let completions = yield this.client.getCompletions({
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
                return yield Promise.all(completions.map((entry) => __awaiter(this, void 0, void 0, function* () { return yield utils_1.convertEntry(this.nvim, entry); })));
            }
            let entryNames = completions.map(v => v.name);
            let detailedCompletions = yield this.client.getCompletionDetails({
                file,
                line,
                offset,
                entryNames
            });
            return yield Promise.all(detailedCompletions.map((entry) => __awaiter(this, void 0, void 0, function* () { return yield utils_1.convertDetailEntry(this.nvim, entry); })));
        });
    }
    //Display Doc symbols in loclist
    getdocsymbols() {
        return __awaiter(this, void 0, void 0, function* () {
            const file = yield this.getCurrentFile();
            const docSysmbols = yield this.getdocsymbolsFunc();
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
        });
    }
    getdocsymbolsFunc() {
        return __awaiter(this, void 0, void 0, function* () {
            yield this.reloadFile();
            const file = yield this.getCurrentFile();
            return yield this.client.getDocumentSymbols({ file });
        });
    }
    getWorkspaceSymbols(args) {
        return __awaiter(this, void 0, void 0, function* () {
            yield this.reloadFile();
            const file = yield this.getCurrentFile();
            const funcArgs = [...args, file];
            const results = yield this.getWorkspaceSymbolsFunc(funcArgs);
            if (results) {
                yield this.createLocList(results, 'WorkspaceSymbols');
            }
        });
    }
    getWorkspaceSymbolsFunc(args) {
        return __awaiter(this, void 0, void 0, function* () {
            const searchValue = args.length > 0 ? args[0] : '';
            const maxResultCount = 50;
            const results = yield this.client.getWorkspaceSymbols({
                file: args[1],
                searchValue,
                maxResultCount: 50
            });
            const symbolsRes = results.map(symbol => {
                return {
                    filename: symbol.file,
                    lnum: symbol.start.line,
                    col: symbol.start.offset,
                    text: `${symbol.name} - ${symbol.kind}`
                };
            });
            return symbolsRes;
        });
    }
    getProjectInfoFunc() {
        return __awaiter(this, void 0, void 0, function* () {
            const file = yield this.getCurrentFile();
            return yield this.client.getProjectInfo({ file, needFileNameList: true });
        });
    }
    createLocList(list, title) {
        return __awaiter(this, void 0, void 0, function* () {
            return new Promise((resolve, reject) => __awaiter(this, void 0, void 0, function* () {
                yield this.nvim.call('setloclist', [0, list, 'r', title]);
                yield this.nvim.command('lwindow');
                resolve();
            }));
        });
    }
    openBufferOrWindow(file, lineNumber, offset) {
        return __awaiter(this, void 0, void 0, function* () {
            const fileIsAlreadyFocused = yield this.getCurrentFile().then(currentFile => file === currentFile);
            if (fileIsAlreadyFocused) {
                yield this.nvim.command(`call cursor(${lineNumber}, ${offset})`);
                return;
            }
            const windowNumber = yield this.nvim.call('bufwinnr', file);
            if (windowNumber != -1) {
                yield this.nvim.command(`${windowNumber}wincmd w`);
            }
            else {
                yield this.nvim.command(`e ${file}`);
            }
            yield this.nvim.command(`call cursor(${lineNumber}, ${offset})`);
        });
    }
    //SERVER Utils
    tsGetServerPath() {
        // Get the path of the tsserver
        return this.client.serverPath;
    }
    tsGetVersion(self, args) {
        return this.client.tsConfigVersion;
    }
    // autocmd function syncs
    onBufEnter() {
        return __awaiter(this, void 0, void 0, function* () {
            if (this.client.serverHandle == null) {
                this.client.setTSConfigVersion();
                yield this.tsstart();
            }
            else {
                const file = yield this.getCurrentFile();
                yield this.client.openFile({ file });
            }
        });
    }
    onBufSave() {
        return __awaiter(this, void 0, void 0, function* () {
            yield this.reloadFile();
        });
    }
    // Life cycle events
    tsstart() {
        return __awaiter(this, void 0, void 0, function* () {
            if (this.client.serverHandle === null) {
                yield this.client.startServer();
                yield this.printMsg(`Server started`);
                const file = yield this.getCurrentFile();
                yield this.client.openFile({ file });
            }
            else {
                console.log('server is running');
                const file = yield this.getCurrentFile();
                yield this.client.openFile({ file });
            }
        });
    }
    tsstop() {
        return __awaiter(this, void 0, void 0, function* () {
            if (this.client.serverHandle != null) {
                this.client.stopServer();
                yield this.printMsg(`Server Stopped`);
            }
        });
    }
    reloadProject() {
        return __awaiter(this, void 0, void 0, function* () {
            yield this.client.reloadProject();
        });
    }
    onCMRefresh(args) {
        return __awaiter(this, void 0, void 0, function* () {
            const info = args[0];
            const ctx = args[1];
            const line = ctx['lnum'];
            const offset = ctx['col'];
            const prefix = ctx['base'];
            const startcol = ctx['startcol'];
            // recheck
            if (yield this.nvim.call('cm#context_changed', ctx))
                return;
            yield this.reloadFile();
            const file = yield this.getCurrentFile();
            const data = yield this.client.getCompletions({
                file,
                line,
                offset,
                prefix,
                includeInsertTextCompletions: false,
                includeExternalModuleExports: false
            });
            if (data.length === 0)
                return [];
            if (data.length > this.maxCompletion) {
                const completions = yield Promise.all(data.map((entry) => __awaiter(this, void 0, void 0, function* () { return yield utils_1.convertEntry(this.nvim, entry); })));
                yield this.nvim.call('cm#complete', [info, ctx, startcol, completions]);
                return;
            }
            let entryNames = data.map(v => v.name);
            const detailedCompletions = yield this.client.getCompletionDetails({
                file,
                line,
                offset,
                entryNames
            });
            const detailedEntries = yield Promise.all(detailedCompletions.map((entry) => __awaiter(this, void 0, void 0, function* () { return yield utils_1.convertDetailEntry(this.nvim, entry); })));
            yield this.nvim.call('cm#complete', [info, ctx, startcol, detailedEntries]);
        });
    }
    // Utils
    // TODO: Extract to own file
    printErr(message) {
        return __awaiter(this, void 0, void 0, function* () {
            yield this.nvim.errWrite(`nvim-ts: ${message} \n`);
        });
    }
    printMsg(message) {
        return __awaiter(this, void 0, void 0, function* () {
            yield this.nvim.outWrite(`nvim-ts: ${message} \n`);
        });
    }
    printHighlight(message) {
        return __awaiter(this, void 0, void 0, function* () {
            yield this.nvim.command(`redraws! | echom "nvim-ts: " | echohl Function | echon "${message}" | echohl None`);
        });
    }
    log(message) {
        return __awaiter(this, void 0, void 0, function* () {
            yield this.nvim.outWrite(`${message} \n`);
        });
    }
    reloadFile() {
        return __awaiter(this, void 0, void 0, function* () {
            return new Promise((resolve, reject) => __awaiter(this, void 0, void 0, function* () {
                const file = yield this.getCurrentFile();
                const contents = (yield this.nvim.buffer.lines).join('\n');
                console.debug('FILE', file);
                const temp = tmp_1.fileSync();
                fs_1.writeFileSync(temp.name, contents, 'utf8');
                return this.client
                    .updateFile({ file, tmpfile: temp.name })
                    .then(res => resolve(res));
            }));
        });
    }
    getCurrentFile() {
        return __awaiter(this, void 0, void 0, function* () {
            return yield this.nvim.buffer.name;
        });
    }
    getCursorPos() {
        return __awaiter(this, void 0, void 0, function* () {
            return yield this.nvim.window.cursor;
        });
    }
    getCommonData() {
        return __awaiter(this, void 0, void 0, function* () {
            let file = yield this.getCurrentFile();
            let cursorPos = yield this.getCursorPos();
            return {
                file,
                line: cursorPos[0],
                offset: cursorPos[1] + 1
            };
        });
    }
};
__decorate([
    neovim_1.Command('TSType'),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", Promise)
], TSHost.prototype, "getType", null);
__decorate([
    neovim_1.Command('TSTypeDef'),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", Promise)
], TSHost.prototype, "tstypedef", null);
__decorate([
    neovim_1.Command('TSImport'),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", Promise)
], TSHost.prototype, "tsImport", null);
__decorate([
    neovim_1.Command('TSSig'),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", Promise)
], TSHost.prototype, "getSig", null);
__decorate([
    neovim_1.Command('TSDef'),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", Promise)
], TSHost.prototype, "getDef", null);
__decorate([
    neovim_1.Command('TSDefPreview'),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", Promise)
], TSHost.prototype, "getDefPreview", null);
__decorate([
    neovim_1.Command('TSDoc'),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", Promise)
], TSHost.prototype, "getDoc", null);
__decorate([
    neovim_1.Command('TSRename', { nargs: '*' }),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], TSHost.prototype, "tsRename", null);
__decorate([
    neovim_1.Command('TSSig'),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", Promise)
], TSHost.prototype, "tssig", null);
__decorate([
    neovim_1.Command('TSRefs'),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", Promise)
], TSHost.prototype, "tsRefs", null);
__decorate([
    neovim_1.Command('TSEditConfig'),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], TSHost.prototype, "tsEditconfig", null);
__decorate([
    neovim_1.Function('TSOmnicFunc', { sync: true }),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], TSHost.prototype, "getCompletions", null);
__decorate([
    neovim_1.Function('TSComplete', { sync: true }),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], TSHost.prototype, "tsComplete", null);
__decorate([
    neovim_1.Command('TSGetDocSymbols'),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", Promise)
], TSHost.prototype, "getdocsymbols", null);
__decorate([
    neovim_1.Function('TSGetDocSymbolsFunc', { sync: true }),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", Promise)
], TSHost.prototype, "getdocsymbolsFunc", null);
__decorate([
    neovim_1.Command('TSGetWorkspaceSymbols', { nargs: '*' }),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], TSHost.prototype, "getWorkspaceSymbols", null);
__decorate([
    neovim_1.Function('TSGetWorkspaceSymbolsFunc', { sync: true }),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], TSHost.prototype, "getWorkspaceSymbolsFunc", null);
__decorate([
    neovim_1.Function('TSGetProjectInfoFunc', { sync: true }),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", Promise)
], TSHost.prototype, "getProjectInfoFunc", null);
__decorate([
    neovim_1.Function('TSGetServerPath', { sync: true }),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", void 0)
], TSHost.prototype, "tsGetServerPath", null);
__decorate([
    neovim_1.Function('TSGetVersion', { sync: true }),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object]),
    __metadata("design:returntype", void 0)
], TSHost.prototype, "tsGetVersion", null);
__decorate([
    neovim_1.Function('TSOnBufEnter'),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", Promise)
], TSHost.prototype, "onBufEnter", null);
__decorate([
    neovim_1.Function('TSOnBufSave'),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", Promise)
], TSHost.prototype, "onBufSave", null);
__decorate([
    neovim_1.Command('TSStart', {}),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", Promise)
], TSHost.prototype, "tsstart", null);
__decorate([
    neovim_1.Command('TSStop'),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", Promise)
], TSHost.prototype, "tsstop", null);
__decorate([
    neovim_1.Command('TSReloadProject'),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", Promise)
], TSHost.prototype, "reloadProject", null);
__decorate([
    neovim_1.Function('TSCmRefresh'),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], TSHost.prototype, "onCMRefresh", null);
TSHost = __decorate([
    neovim_1.Plugin({ dev: true }),
    __metadata("design:paramtypes", [Object])
], TSHost);
exports.default = TSHost;
