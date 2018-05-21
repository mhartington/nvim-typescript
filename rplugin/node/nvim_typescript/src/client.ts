import { spawn, ChildProcess, execSync } from 'child_process';
import { normalize } from 'path';
import { EventEmitter } from 'events';
import { existsSync } from 'fs';
import { EOL } from 'os';
import { createInterface } from 'readline';

import protocol from 'typescript/lib/protocol';

import { trim, getLocale } from './utils';

export namespace Client {
  export let serverHandle: ChildProcess = null;
  export let _rl: any;
  export let _seqNumber = 0;
  export let _seqToPromises = {};
  export let _cwd = process.cwd();
  export let _env = process.env;
  export let serverPath = 'tsserver';
  export let serverOptions = [];
  export let logFunc: Function = null;
  export let tsConfigVersion: {
    major: number;
    minor: number;
    patch: number;
  } = null;
  // Get server, set server
  export function getServerPath() {
    return serverPath;
  }
  export function setServerPath(val: string) {
    const normalizedPath = normalize(val);
    if (existsSync(normalizedPath)) {
      serverPath = normalizedPath;
    }
  }

  // Start the Proc
  export function startServer() {
    new Promise((resolve, reject) => {
      // _env['TSS_LOG'] = "-logToFile true -file ./server.log"
      serverHandle = spawn(
        serverPath,
        [...serverOptions, `--locale=${getLocale(process.env)}`],
        {
          stdio: 'pipe',
          cwd: _cwd,
          env: _env,
          detached: true,
          shell: false
        }
      );

      _rl = createInterface({
        input: serverHandle.stdout,
        output: serverHandle.stdin,
        terminal: false
      });

      serverHandle.stderr.on('data', (data, err) => {
        console.error('Error from tss: ' + data);
      });

      serverHandle.on('error', data => {
        console.log(`error Event: ${data}`);
      });

      serverHandle.on('exit', data => {
        console.log(`exit Event: ${data}`);
      });

      serverHandle.on('close', data => {
        console.log(`Close Event: ${data}`);
      });

      _rl.on('line', msg => {
        if (msg.indexOf('{') === 0) {
          parseResponse(msg);
        }
      });
      return resolve();
    });
  }
  export function stopServer() {
    serverHandle.kill('SIGINT');
  }

  export function setTSConfigVersion() {
    const command = serverPath.replace('tsserver', 'tsc');
    const rawOutput = execSync(`${command} --version`).toString();
    const [major, minor, patch] = trim(rawOutput)
      .split(' ')
      .pop()
      .split('-')[0]
      .split('.');
    tsConfigVersion = {
      major: parseInt(major),
      minor: parseInt(minor),
      patch: parseInt(patch)
    };
  }

  export function isCurrentVersionHighter(val) {
    const local =
      tsConfigVersion.major * 100 +
      tsConfigVersion.minor * 10 +
      tsConfigVersion.patch;
    return local >= val;
  }

  // LangServer Commands
  export function openFile(args: protocol.OpenRequestArgs): Promise<any> {
    return _makeTssRequest('open', args);
  }
  export function reloadProject() {
    return _makeTssRequest('reloadProjects', null);
  }
  export function updateFile(
    args: protocol.ReloadRequestArgs
  ): Promise<protocol.ReloadResponse> {
    return _makeTssRequest('reload', args);
  }
  export function quickInfo(
    args: protocol.FileLocationRequestArgs
  ): Promise<protocol.QuickInfoResponseBody> {
    return _makeTssRequest('quickinfo', args);
  }
  export function getDef(
    args: protocol.FileLocationRequestArgs
  ): Promise<protocol.DefinitionResponse['body']> {
    return _makeTssRequest('definition', args);
  }
  export function getCompletions(
    args: protocol.CompletionsRequestArgs
  ): Promise<protocol.CompletionsResponse['body']> {
    return _makeTssRequest('completions', args);
  }
  export function getCompletionDetails(
    args: protocol.CompletionDetailsRequestArgs
  ): Promise<protocol.CompletionDetailsResponse['body']> {
    return _makeTssRequest('completionEntryDetails', args);
  }
  export function getProjectInfo(
    args: protocol.ProjectInfoRequestArgs
  ): Promise<protocol.ProjectInfo> {
    return _makeTssRequest('projectInfo', args);
  }
  export function getSymbolRefs(
    args: protocol.FileLocationRequestArgs
  ): Promise<protocol.ReferencesResponse['body']> {
    return _makeTssRequest('references', args);
  }
  export function getSignature(
    args: protocol.FileLocationRequestArgs
  ): Promise<protocol.SignatureHelpResponse['body']> {
    return _makeTssRequest('signatureHelp', args);
  }
  export function renameSymbol(
    args: protocol.RenameRequestArgs
  ): Promise<protocol.RenameResponseBody> {
    return _makeTssRequest('rename', args);
  }
  export function getTypeDef(
    args: protocol.FileLocationRequestArgs
  ): Promise<protocol.TypeDefinitionResponse['body']> {
    return _makeTssRequest('typeDefinition', args);
  }

  export function getDocumentSymbols(
    args: protocol.FileRequestArgs
  ): Promise<protocol.NavTreeResponse['body']> {
    return _makeTssRequest('navtree', args);
  }

  export function getCodeFixesAtCursor(
    args: protocol.CodeFixRequestArgs
  ): Promise<protocol.CodeFixResponse['body']> {
    return _makeTssRequest('getCodeFixes', args);
  }
  export function getWorkspaceSymbols(
    args: protocol.NavtoRequestArgs
  ): Promise<protocol.NavtoResponse['body']> {
    return _makeTssRequest('navto', args);
  }

  // Server communication
  function _makeTssRequest<T>(commandName: string, args: any): Promise<T> {
    // console.log('making request', commandName)
    const seq = _seqNumber++;
    const payload = {
      seq,
      type: 'request',
      command: commandName,
      arguments: args
    };
    const ret = createDeferredPromise<T>();
    _seqToPromises[seq] = ret;
    serverHandle.stdin.write(JSON.stringify(payload) + EOL);
    return ret.promise;
  }
  function parseResponse(returnedData: string): void {
    const response = JSON.parse(returnedData);
    const seq = response['request_seq']; // tslint:disable-line no-string-literal
    const success = response['success']; // tslint:disable-line no-string-literal
    if (typeof seq === 'number') {
      if (success) {
        // console.log(response.body)
        _seqToPromises[seq].resolve(response.body);
      } else {
        _seqToPromises[seq].reject(new Error(response.message));
      }
    } else {
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
  function createDeferredPromise<T>(): any {
    let resolve: Function;
    let reject: Function;
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
