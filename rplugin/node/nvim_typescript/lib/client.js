"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const child_process_1 = require("child_process");
const path_1 = require("path");
const events_1 = require("events");
const fs_1 = require("fs");
const os_1 = require("os");
const readline_1 = require("readline");
const utils_1 = require("./utils");
class Client extends events_1.EventEmitter {
    constructor() {
        super(...arguments);
        this.serverHandle = null;
        this._seqNumber = 0;
        this._seqToPromises = {};
        this._cwd = process.cwd();
        this._env = process.env;
        this.serverPath = 'tsserver';
        this.serverOptions = [];
        this.logFunc = null;
        this.tsConfigVersion = null;
    }
    // Get server, set server
    getServerPath() {
        return this.serverPath;
    }
    setServerPath(val) {
        const normalizedPath = path_1.normalize(val);
        if (fs_1.existsSync(normalizedPath)) {
            this.serverPath = normalizedPath;
        }
    }
    // Start the Proc
    startServer() {
        // _env['TSS_LOG'] = "-logToFile true -file ./server.log"
        if (os_1.platform() === 'win32') {
            this.serverHandle = child_process_1.spawn('cmd', [
                '/c',
                this.serverPath,
                ...this.serverOptions,
                `--disableAutomaticTypingAcquisition`
            ], {
                stdio: 'pipe',
                cwd: this._cwd,
                env: this._env,
                // detached must be false for windows to avoid child window
                // https://nodejs.org/api/child_process.html#child_process_options_detached
                detached: false,
                shell: false
            });
        }
        else {
            this.serverHandle = child_process_1.spawn(this.serverPath, [
                ...this.serverOptions,
                `--disableAutomaticTypingAcquisition`
            ], {
                stdio: 'pipe',
                cwd: this._cwd,
                env: this._env,
                detached: true,
                shell: false
            });
        }
        this._rl = readline_1.createInterface({
            input: this.serverHandle.stdout,
            output: this.serverHandle.stdin,
            terminal: false
        });
        this.serverHandle.stderr.on('data', (data, err) => {
            console.error('Error from tss: ' + data);
        });
        this.serverHandle.on('error', data => {
            console.log(`ERROR Event: ${data}`);
        });
        this.serverHandle.on('exit', data => {
            console.log(`exit Event: ${data}`);
        });
        this.serverHandle.on('close', data => {
            console.log(`Close Event: ${data}`);
        });
        this._rl.on('line', msg => {
            if (msg.indexOf('{') === 0) {
                this.parseResponse(msg);
            }
        });
    }
    stopServer() {
        this.serverHandle.kill('SIGINT');
    }
    setTSConfigVersion() {
        const command = this.serverPath.replace('tsserver', 'tsc');
        const rawOutput = child_process_1.execSync(`${command} --version`).toString();
        const [major, minor, patch] = utils_1.trim(rawOutput)
            .split(' ')
            .pop()
            .split('-')[0]
            .split('.');
        this.tsConfigVersion = {
            major: parseInt(major),
            minor: parseInt(minor),
            patch: parseInt(patch)
        };
    }
    isCurrentVersionHighter(val) {
        const local = this.tsConfigVersion.major * 100 +
            this.tsConfigVersion.minor * 10 +
            this.tsConfigVersion.patch;
        return local >= val;
    }
    // LangServer Commands
    openFile(args) {
        return this._makeTssRequest('open', args);
    }
    reloadProject() {
        return this._makeTssRequest('reloadProjects', null);
    }
    updateFile(args) {
        return this._makeTssRequest('reload', args);
    }
    quickInfo(args) {
        return this._makeTssRequest('quickinfo', args);
    }
    getDef(args) {
        return this._makeTssRequest('definition', args);
    }
    getCompletions(args) {
        return this._makeTssRequest('completions', args);
    }
    getCompletionDetails(args) {
        return this._makeTssRequest('completionEntryDetails', args);
    }
    getProjectInfo(args) {
        return this._makeTssRequest('projectInfo', args);
    }
    getSymbolRefs(args) {
        return this._makeTssRequest('references', args);
    }
    getSignature(args) {
        return this._makeTssRequest('signatureHelp', args);
    }
    renameSymbol(args) {
        return this._makeTssRequest('rename', args);
    }
    getTypeDef(args) {
        return this._makeTssRequest('typeDefinition', args);
    }
    getDocumentSymbols(args) {
        return this._makeTssRequest('navtree', args);
    }
    getWorkspaceSymbols(args) {
        return this._makeTssRequest('navto', args);
    }
    getSemanticDiagnosticsSync(args) {
        return this._makeTssRequest('semanticDiagnosticsSync', args);
    }
    getSyntacticDiagnosticsSync(args) {
        return this._makeTssRequest('syntacticDiagnosticsSync', args);
    }
    getSuggestionDiagnosticsSync(args) {
        return this._makeTssRequest('suggestionDiagnosticsSync', args);
    }
    getErr(args) {
        return this._makeTssRequest('geterr', args);
    }
    // getOutliningSpans(){}
    getCodeFixes(args) {
        return this._makeTssRequest("getCodeFixes" /* GetCodeFixes */, args);
    }
    getSupportedCodeFixes() {
        return this._makeTssRequest('getSupportedCodeFixes', null);
    }
    // Server communication
    _makeTssRequest(commandName, args) {
        const seq = this._seqNumber++;
        const payload = {
            seq,
            type: 'request',
            command: commandName,
            arguments: args
        };
        const ret = this.createDeferredPromise();
        this._seqToPromises[seq] = ret;
        this.serverHandle.stdin.write(JSON.stringify(payload) + os_1.EOL);
        return ret.promise;
    }
    parseResponse(returnedData) {
        const response = JSON.parse(returnedData);
        const seq = response.request_seq;
        const success = response.success;
        if (typeof seq === 'number') {
            if (success) {
                this._seqToPromises[seq].resolve(response.body);
            }
            else {
                this._seqToPromises[seq].reject(new Error(response.message));
            }
        }
        else {
            // If a sequence wasn't specified, it might be a call that returns multiple results
            // Like 'geterr' - returns both semanticDiag and syntaxDiag
            if (response.type && response.type === 'event') {
                if (response.event && response.event === 'telemetry') {
                }
                if (response.event && response.event === 'semanticDiag') {
                    this.emit('semanticDiag', response.body);
                }
            }
        }
    }
    createDeferredPromise() {
        let resolve;
        let reject;
        const promise = new Promise((res, rej) => {
            resolve = res;
            reject = rej;
        });
        return {
            resolve,
            reject,
            promise
        };
    }
}
exports.Client = Client;
exports.TSServer = new Client();
