#! /usr/bin/env python3
import queue
import os
import json
import subprocess

server_handle = None
project_root = None
__server_seq = 1
__environ = os.environ.copy()
tsConfigVersion = None
serverPath = None
logFunc = None


def __get_next_seq():
    global __server_seq
    seq = __server_seq
    __server_seq += 1
    return seq


def log(message):
    global logFunc
    if logFunc:
        logFunc(str(message))


def setServerPath(value):
    """
    Set the server Path
    """
    global serverPath
    if os.path.isfile(value):
        serverPath = os.path.normpath(value)
    else:
        serverPath = 'tsserver'


def setTsConfigVersion():
    global tsConfigVersion
    global serverPath
    command = serverPath.replace('tsserver', 'tsc')
    rawOutput = subprocess.check_output(command + ' --version', shell=True)
    # strip nightly
    pure_version = rawOutput.rstrip().decode(
        'utf-8').split(' ').pop().split('-')[0]
    [major, minor, patch] = pure_version.split('.')[:3]
    tsConfigVersion = {"major": int(
        major), "minor": int(minor), "patch": int(patch)}


def isCurrentVersionHigher(val):
    global tsConfigVersion
    local = tsConfigVersion["major"] * 100 + \
        tsConfigVersion["minor"] * 10 + tsConfigVersion["patch"]
    return local > val


def project_cwd(root):
    mydir = root
    if mydir:
        projectdir = mydir
        while True:
            parent = os.path.dirname(mydir[:-1])
            if not parent:
                break
            if os.path.isfile(os.path.join(mydir, "tsconfig.json")) or \
                    os.path.isfile(os.path.join(mydir, "jsconfig.json")):
                projectdir = mydir
                break
            mydir = parent
    # I know, checking again?
    # This function needs to either return the path, or Flase, so it's
    # needed
    if os.path.isfile(os.path.join(projectdir, 'tsconfig.json')) or os.path.isfile(os.path.join(projectdir, 'jsconfig.json')):
        project_root = projectdir
        return projectdir
    else:
        return False


def stop():
    """
    send a stop request
    """
    global server_handle
    server_handle.kill()
    server_handle = None


def status():
    global server_handle
    if server_handle is not None:
        poll = server_handle.poll()
        if poll is None:
            return 'running'
        else:
            return 'stopped'
    else:
        return 'stopped'


def start(should_debug, debug_options):
    """
    start proc
    """
    global server_handle
    global serverPath
    global __environ

    # https://github.com/Microsoft/TypeScript/blob/master/lib/protocol.d.ts
    if server_handle is None:
        if should_debug is not 0:
            __environ['TSS_LOG'] = "-logToFile true -file {0} -level {1}".format(
                debug_options['file'], debug_options['level'])
        server_handle = subprocess.Popen(
            [serverPath, "--disableAutomaticTypingAcquisition"],
            env=__environ,
            cwd=os.getcwd(),
            stdin=subprocess.PIPE,
            stdout=subprocess.PIPE,
            stderr=None,
            universal_newlines=True,
            bufsize=-1,
            shell=True,
        )
        return True
    else:
        return


def restart():
    """
    internal
    start/stop the proc
    """
    stop()
    start()


def __write_to_server(data):
    serialized_request = json.dumps(data) + "\n"
    server_handle.stdin.write(serialized_request)
    server_handle.stdin.flush()


def send_request(command, arguments=None):
    global server_handle
    # log(server_handle)
    request = build_request(command, arguments)
    if server_handle is None:
        log('no server_handle')
    if server_handle is not None:
        __write_to_server(request)

        # linecount = 0
        # headers = {}
        while True:
            # log('here?')
            headerline = server_handle.stdout.readline().strip()
            # log('loggging {}'.format(serve))
            newline = server_handle.stdout.readline().strip()
            # log('loggging {}'.format(request))
            content = server_handle.stdout.readline().strip()
            # log('loggging {}'.format(content))
            ret = json.loads(content)

            # batch of ignore events.
            # TODO: refactor for a conditional loop

            # TS 1.9.x returns two reload finished responses
            if not isCurrentVersionHigher(260) and isCurrentVersionHigher(190):
                if ('body', {'reloadFinished': True}) in ret.items():
                    continue

            # TS 2.0.6 introduces configFileDiag event, ignore
            if ("event", "configFileDiag") in ret.items():
                continue

            if ("event", "requestCompleted") in ret.items():
                continue

            # TS 2.6 adds telemetry event, ignore
            if ("event", "telemetry") in ret.items():
                continue

            if "request_seq" not in ret:
                if ("event", "syntaxDiag") in ret.items():
                    continue
                if ("event", "semanticDiag") in ret.items():
                    return ret
                else:
                    continue

            if ret["request_seq"] > request['seq']:
                return None
            if ret["request_seq"] == request['seq']:
                return ret


def send_command(command, arguments=None):
    request = build_request(command, arguments)
    __write_to_server(request)


def build_request(command, arguments=None):
    request = {
        "seq": __get_next_seq(),
        "type": "request",
        "command": command
    }
    if arguments:
        request['arguments'] = arguments
    return request


def open(file):
    """
        Sends an "open" request

        :type file: string
    """
    args = {"file": file}
    send_command("open", args)


def close(file):
    """
        Sends a "close" request

        :type file: string
    """
    args = {"file": file}
    send_command("close", args)


def refresh():
    send_command("reloadProjects")


def saveto(file, tmpfile):
    """
        Sends a "saveto" request

        :type file: string
        :type tmpfile: string
    """
    args = {"file": file, "tmpfile": tmpfile}
    send_command("saveto", args)


def reload(file, tmpfile):
    args = {"file": file, "tmpfile": tmpfile}
    response = send_request("reload", args)
    return response["success"] if response and "success" in response else False


def getCodeFixesAtCursor(file, cursorPosition, errorCodes):
    line = cursorPosition["line"]
    col = cursorPosition["col"]
    args = {
        "file": file,
        "startLine": line,
        "endLine": line,
        "startOffset": col,
        "endOffset": col,
        "errorCodes": errorCodes
    }
    response = send_request("getCodeFixes", args)
    return response


def getErr(files):
    args = {"files": files}
    response = send_request("geterr", args)
    return get_error_res_body(response)


def syntacticDiagnosticsSync(file):
    args = {"file": file}
    response = send_request("syntacticDiagnosticsSync", args)
    return get_response_body(response)


def semanticDiagnosticsSync(file):
    args = {"file": file}
    response = send_request("semanticDiagnosticsSync", args)
    return get_response_body(response)


def getDocumentSymbols(file):
    args = {"file": file}
    response = send_request("navtree", args)
    return get_response_body(response)


def getWorkspaceSymbols(file, term=''):
    args = {"file": file, "searchValue": term, "maxResultCount": 50}
    response = send_request("navto", args)
    return get_response_body(response)


def getDoc(file, line, offset):
    """
        Sends a "quickinfo" request

        :type file: string
        :type line: number
        :type offset: number
    """
    args = {"file": file, "line": line, "offset": offset}
    response = send_request("quickinfo", args)
    return get_response_body(response)


def getSignature(file, line, offset):
    """
        Sends a "signatureHelp" request

        :type file: string
        :type line: number
        :type offset: number
    """
    args = {"file": file, "line": line, "offset": offset}
    response = send_request("signatureHelp", args)
    return get_response_body(response)


def getTypeDefinition(file, line, offset):
    """
        Sends a "signatureHelp" request

        :type file: string
        :type line: number
        :type offset: number
    """
    args = {"file": file, "line": line, "offset": offset}
    response = send_request("typeDefinition", args)
    return get_response_body(response)


def getRef(file, line, offset):
    args = {"file": file, "line": line, "offset": offset}
    response = send_request("references", args)
    return get_response_body(response)


def goToDefinition(file, line, offset):
    """
        Sends a "definition" request

        :type file: string
        :type line: number
        :type offset: number
    """
    args = {"file": file, "line": line, "offset": offset}
    response = send_request("definition", args)
    return get_response_body(response)


def renameSymbol(file, line, offset):
    args = {"file": file, "line": line, "offset": offset,
            'findInComments': False, 'findInStrings': False}
    response = send_request("rename", args)
    return get_response_body(response)


def completions(file, line, offset, prefix=""):
    """
        Sends a "completions" request

        :type file: string
        :type line: int
        :type offset: int
        :type prefix: string
    """
    args = {
        "file": file,
        "line": line,
        "offset": offset,
        "prefix": prefix
    }

    response = send_request("completions", args)
    # log(response)
    return get_response_body(response)


def completion_entry_details(file, line, offset, entry_names):
    """
        Sends a "completionEntryDetails" request

        :type file: string
        :type line: int
        :type offset: int
        :type entry_names: array
    """

    args = {
        "file": file,
        "line": line,
        "offset": offset,
        "entryNames": entry_names
    }
    response = send_request("completionEntryDetails", args)
    return get_response_body(response)


def projectInfo(file):
    args = {
        'file': file,
        'needFileNameList': 'false'
    }
    response = send_request("projectInfo", args)
    return get_response_body(response)


def getApplicableRefactors(args):
    response = send_request("getApplicableRefactors", args)
    return get_response_body(response)


def get_error_res_body(response, default=[]):
    # Should we raise an error if success == False ?
    return response["body"]


def get_response_body(response, default=[]):
    success = bool(response) and "success" in response and response["success"]
    # Should we raise an error if success == False ?
    return response["body"] if success and "body" in response else default
