"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const child_process_1 = require("child_process");
const path_1 = require("path");
const fs_1 = require("fs");
const os_1 = require("os");
const readline_1 = require("readline");
const utils_1 = require("./utils");
var Client;
(function (Client) {
    Client.serverHandle = null;
    Client._seqNumber = 0;
    Client._seqToPromises = {};
    Client._cwd = process.cwd();
    Client._env = process.env;
    Client.serverPath = 'tsserver';
    Client.serverOptions = [];
    Client.logFunc = null;
    Client.tsConfigVersion = null;
    // Get server, set server
    function getServerPath() {
        return Client.serverPath;
    }
    Client.getServerPath = getServerPath;
    function setServerPath(val) {
        const normalizedPath = path_1.normalize(val);
        if (fs_1.existsSync(normalizedPath)) {
            Client.serverPath = normalizedPath;
        }
    }
    Client.setServerPath = setServerPath;
    // Start the Proc
    function startServer() {
        new Promise((resolve, reject) => {
            // _env['TSS_LOG'] = "-logToFile true -file ./server.log"
            Client.serverHandle = child_process_1.spawn(Client.serverPath, [...Client.serverOptions, `--locale=${utils_1.getLocale(process.env)}`], {
                stdio: 'pipe',
                cwd: Client._cwd,
                env: Client._env,
                detached: true,
                shell: false
            });
            Client._rl = readline_1.createInterface({
                input: Client.serverHandle.stdout,
                output: Client.serverHandle.stdin,
                terminal: false
            });
            Client.serverHandle.stderr.on('data', (data, err) => {
                console.error('Error from tss: ' + data);
            });
            Client.serverHandle.on('error', data => {
                console.log(`error Event: ${data}`);
            });
            Client.serverHandle.on('exit', data => {
                console.log(`exit Event: ${data}`);
            });
            Client.serverHandle.on('close', data => {
                console.log(`Close Event: ${data}`);
            });
            Client._rl.on('line', msg => {
                if (msg.indexOf('{') === 0) {
                    parseResponse(msg);
                }
            });
            return resolve();
        });
    }
    Client.startServer = startServer;
    function stopServer() {
        Client.serverHandle.kill('SIGINT');
    }
    Client.stopServer = stopServer;
    function setTSConfigVersion() {
        const command = Client.serverPath.replace('tsserver', 'tsc');
        const rawOutput = child_process_1.execSync(`${command} --version`).toString();
        const [major, minor, patch] = utils_1.trim(rawOutput)
            .split(' ')
            .pop()
            .split('-')[0]
            .split('.');
        Client.tsConfigVersion = {
            major: parseInt(major),
            minor: parseInt(minor),
            patch: parseInt(patch)
        };
    }
    Client.setTSConfigVersion = setTSConfigVersion;
    function isCurrentVersionHighter(val) {
        const local = Client.tsConfigVersion.major * 100 +
            Client.tsConfigVersion.minor * 10 +
            Client.tsConfigVersion.patch;
        return local >= val;
    }
    Client.isCurrentVersionHighter = isCurrentVersionHighter;
    // LangServer Commands
    function openFile(args) {
        return _makeTssRequest('open', args);
    }
    Client.openFile = openFile;
    function reloadProject() {
        return _makeTssRequest('reloadProjects', null);
    }
    Client.reloadProject = reloadProject;
    function updateFile(args) {
        return _makeTssRequest('reload', args);
    }
    Client.updateFile = updateFile;
    function quickInfo(args) {
        return _makeTssRequest('quickinfo', args);
    }
    Client.quickInfo = quickInfo;
    function getDef(args) {
        return _makeTssRequest('definition', args);
    }
    Client.getDef = getDef;
    function getCompletions(args) {
        return _makeTssRequest('completions', args);
    }
    Client.getCompletions = getCompletions;
    function getCompletionDetails(args) {
        return _makeTssRequest('completionEntryDetails', args);
    }
    Client.getCompletionDetails = getCompletionDetails;
    function getProjectInfo(args) {
        return _makeTssRequest('projectInfo', args);
    }
    Client.getProjectInfo = getProjectInfo;
    function getSymbolRefs(args) {
        return _makeTssRequest('references', args);
    }
    Client.getSymbolRefs = getSymbolRefs;
    function getSignature(args) {
        return _makeTssRequest('signatureHelp', args);
    }
    Client.getSignature = getSignature;
    function renameSymbol(args) {
        return _makeTssRequest('rename', args);
    }
    Client.renameSymbol = renameSymbol;
    function getTypeDef(args) {
        return _makeTssRequest('typeDefinition', args);
    }
    Client.getTypeDef = getTypeDef;
    function getDocumentSymbols(args) {
        return _makeTssRequest('navtree', args);
    }
    Client.getDocumentSymbols = getDocumentSymbols;
    function getCodeFixesAtCursor(args) {
        return _makeTssRequest('getCodeFixes', args);
    }
    Client.getCodeFixesAtCursor = getCodeFixesAtCursor;
    function getWorkspaceSymbols(args) {
        return _makeTssRequest('navto', args);
    }
    Client.getWorkspaceSymbols = getWorkspaceSymbols;
    // Server communication
    function _makeTssRequest(commandName, args) {
        // console.log('making request', commandName)
        const seq = Client._seqNumber++;
        const payload = {
            seq,
            type: 'request',
            command: commandName,
            arguments: args
        };
        const ret = createDeferredPromise();
        Client._seqToPromises[seq] = ret;
        Client.serverHandle.stdin.write(JSON.stringify(payload) + os_1.EOL);
        return ret.promise;
    }
    function parseResponse(returnedData) {
        const response = JSON.parse(returnedData);
        const seq = response['request_seq']; // tslint:disable-line no-string-literal
        const success = response['success']; // tslint:disable-line no-string-literal
        if (typeof seq === 'number') {
            if (success) {
                // console.log(response.body)
                Client._seqToPromises[seq].resolve(response.body);
            }
            else {
                Client._seqToPromises[seq].reject(new Error(response.message));
            }
        }
        else {
            // If a sequence wasn't specified, it might be a call that returns multiple results
            // Like 'geterr' - returns both semanticDiag and syntaxDiag
            if (response.type && response.type === 'event') {
                if (response.event && response.event === 'telemetry') {
                    // console.log(response.body.payload.version)
                }
                if (response.event && response.event === 'semanticDiag') {
                    // console.log(response.body);
                    // this.emit("semanticDiag", response.body);
                }
            }
        }
    }
    function createDeferredPromise() {
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
})(Client = exports.Client || (exports.Client = {}));
