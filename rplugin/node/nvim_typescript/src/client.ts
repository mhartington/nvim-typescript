import { spawn, ChildProcess, execSync } from 'child_process';
import { normalize } from 'path';
import { EventEmitter } from 'events';
import { existsSync } from 'fs';
import { platform, EOL } from 'os';
import { createInterface } from 'readline';

import protocol from 'typescript/lib/protocol';

import { trim } from './utils';

export class Client extends EventEmitter {
  public serverHandle: ChildProcess = null;
  public _rl: any;
  public _seqNumber = 0;
  public _seqToPromises = {};
  public _cwd = process.cwd();
  public _env = process.env;
  public serverPath = 'tsserver';
  public serverOptions: string[] = [];
  public logFunc: Function = null;
  public tsConfigVersion: {
    major: number;
    minor: number;
    patch: number;
  } = null;
  // Get server, set server
  getServerPath() {
    return this.serverPath;
  }
  setServerPath(val: string) {
    const normalizedPath = normalize(val);
    if (existsSync(normalizedPath)) {
      this.serverPath = normalizedPath;
    }
  }

  // Start the Proc
  startServer() {
    // _env['TSS_LOG'] = "-logToFile true -file ./server.log"
    if (platform() === 'win32') {
      this.serverHandle = spawn(
        'cmd',
        [
          '/c',
          this.serverPath,
          ...this.serverOptions,
          `--disableAutomaticTypingAcquisition`
        ],
        {
          stdio: 'pipe',
          cwd: this._cwd,
          env: this._env,
          // detached must be false for windows to avoid child window
          // https://nodejs.org/api/child_process.html#child_process_options_detached
          detached: false,
          shell: false
        }
      );
    } else {
      this.serverHandle = spawn(
        this.serverPath,
        [
          ...this.serverOptions,
          `--disableAutomaticTypingAcquisition`
        ],
        {
          stdio: 'pipe',
          cwd: this._cwd,
          env: this._env,
          detached: true,
          shell: false
        }
      );
    }

    this._rl = createInterface({
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
    const rawOutput = execSync(`${command} --version`).toString();
    const [major, minor, patch] = trim(rawOutput)
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
    const local =
      this.tsConfigVersion.major * 100 +
      this.tsConfigVersion.minor * 10 +
      this.tsConfigVersion.patch;
    return local >= val;
  }

  // LangServer Commands
  openFile(args: protocol.OpenRequestArgs): Promise<any> {
    return this._makeTssRequest('open', args);
  }
  reloadProject() {
    return this._makeTssRequest('reloadProjects', null);
  }
  updateFile(
    args: protocol.ReloadRequestArgs
  ): Promise<protocol.ReloadResponse> {
    return this._makeTssRequest('reload', args);
  }
  quickInfo(
    args: protocol.FileLocationRequestArgs
  ): Promise<protocol.QuickInfoResponseBody> {
    return this._makeTssRequest('quickinfo', args);
  }
  getDef(
    args: protocol.FileLocationRequestArgs
  ): Promise<protocol.DefinitionResponse['body']> {
    return this._makeTssRequest('definition', args);
  }
  getCompletions(
    args: protocol.CompletionsRequestArgs
  ): Promise<protocol.CompletionsResponse['body']> {
    return this._makeTssRequest('completions', args);
  }
  getCompletionDetails(
    args: protocol.CompletionDetailsRequestArgs
  ): Promise<protocol.CompletionDetailsResponse['body']> {
    return this._makeTssRequest('completionEntryDetails', args);
  }
  getProjectInfo(
    args: protocol.ProjectInfoRequestArgs
  ): Promise<protocol.ProjectInfo> {
    return this._makeTssRequest('projectInfo', args);
  }
  getSymbolRefs(
    args: protocol.FileLocationRequestArgs
  ): Promise<protocol.ReferencesResponse['body']> {
    return this._makeTssRequest('references', args);
  }
  getSignature(
    args: protocol.FileLocationRequestArgs
  ): Promise<protocol.SignatureHelpResponse['body']> {
    return this._makeTssRequest('signatureHelp', args);
  }
  renameSymbol(
    args: protocol.RenameRequestArgs
  ): Promise<protocol.RenameResponseBody> {
    return this._makeTssRequest('rename', args);
  }
  getTypeDef(
    args: protocol.FileLocationRequestArgs
  ): Promise<protocol.TypeDefinitionResponse['body']> {
    return this._makeTssRequest('typeDefinition', args);
  }

  getDocumentSymbols(
    args: protocol.FileRequestArgs
  ): Promise<protocol.NavTreeResponse['body']> {
    return this._makeTssRequest('navtree', args);
  }

  getWorkspaceSymbols(
    args: protocol.NavtoRequestArgs
  ): Promise<protocol.NavtoResponse['body']> {
    return this._makeTssRequest('navto', args);
  }

  getSemanticDiagnosticsSync(
    args: protocol.SemanticDiagnosticsSyncRequestArgs
  ): Promise<protocol.Diagnostic[]> {
    return this._makeTssRequest('semanticDiagnosticsSync', args);
  }
  getSyntacticDiagnosticsSync(
    args: protocol.SyntacticDiagnosticsSyncRequestArgs
  ): Promise<protocol.Diagnostic[]> {
    return this._makeTssRequest('syntacticDiagnosticsSync', args);
  }
  getSuggestionDiagnosticsSync(
    args: protocol.SuggestionDiagnosticsSyncRequestArgs
  ): Promise<protocol.Diagnostic[]> {
    return this._makeTssRequest('suggestionDiagnosticsSync', args);
  }

  getErr(args: protocol.GeterrRequestArgs): Promise<any> {
    return this._makeTssRequest('geterr', args);
  }

  // getOutliningSpans(){}
  getCodeFixes(
    args: protocol.CodeFixRequestArgs
  ): Promise<protocol.GetCodeFixesResponse['body']> {
    return this._makeTssRequest(protocol.CommandTypes.GetCodeFixes, args);
  }

  getSupportedCodeFixes(): Promise<
    protocol.GetSupportedCodeFixesResponse['body']
  > {
    return this._makeTssRequest('getSupportedCodeFixes', null);
  }

  // Server communication
  _makeTssRequest<T>(commandName: string, args: any): Promise<T> {
    const seq = this._seqNumber++;
    const payload = {
      seq,
      type: 'request',
      command: commandName,
      arguments: args
    };
    const ret = this.createDeferredPromise<T>();
    this._seqToPromises[seq] = ret;
    this.serverHandle.stdin.write(JSON.stringify(payload) + EOL);
    return ret.promise;
  }
  parseResponse(returnedData: string): void {
    const response = JSON.parse(returnedData);
    const seq = response.request_seq;
    const success = response.success;
    if (typeof seq === 'number') {
      if (success) {
        this._seqToPromises[seq].resolve(response.body);
      } else {
        this._seqToPromises[seq].reject(new Error(response.message));
      }
    } else {
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
  createDeferredPromise<T>(): any {
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

export const TSServer = new Client();
