import os
import sys
import json
import subprocess


class Client(object):
    server_handle = None
    project_root = None
    __server_seq = 1
    __environ = os.environ.copy()
    __tsConfig = None

    def __init__(self, log_fn=None, debug_fn=None):
        self.log_fn = log_fn
        self.debug_fn = debug_fn

    @classmethod
    def __get_next_seq(cls):
        seq = cls.__server_seq
        cls.__server_seq += 1
        return seq

    @property
    def serverPath(self):
        """
        Server path property
        """
        return self._serverPath

    @serverPath.setter
    def serverPath(self, value):
        """
        Set the server Path
        """
        if os.path.isfile(value):
            self._serverPath = value
        else:
            self._serverPath = 'tsserver'

    @property
    def tsConfig(self):
        return Client.__tsConfig

    @tsConfig.setter
    def tsConfg(self, val):
        Client.__tsConfig = val

    def setTsConfig(self):
        rawOutput = subprocess.check_output(['tsc', '--version'])
        # formats out to be a list [major, minor, patch]
        [major, minor, patch] = rawOutput.rstrip().decode(
            "utf-8").replace('Version ', '').split('.')
        self.tsConfg = {"major": int(major), "minor": int(
            minor), "patch": int(patch)}

    def isHigher(self, val):
        local = self.tsConfg["major"] * 100 + \
            self.tsConfg["minor"] * 10 + self.tsConfg["patch"]
        return local > val

    def project_cwd(self, root):
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
            Client.project_root = projectdir
            return projectdir
        else:
            return False

    def __log(self, message):
        if self.log_fn:
            self.log_fn(str(message))

    def __debug(self, message):
        if self.debug_fn:
            self.debug_fn(message)

    def stop(self):
        """
        send a stop request
        """
        Client.server_handle.kill()
        Client.server_handle = None

    def start(self):
        """
        start proc
        """
        # https://github.com/Microsoft/TypeScript/blob/master/lib/protocol.d.ts#L854
        if Client.server_handle is None:
            # Client.__environ['TSS_LOG'] = "-logToFile true -file ./server.log"
            Client.server_handle = subprocess.Popen(
                [self.serverPath, "--disableAutomaticTypingAcquisition"],
                env=Client.__environ,
                cwd=os.getcwd(),
                stdin=subprocess.PIPE,
                stdout=subprocess.PIPE,
                stderr=None,
                universal_newlines=True,
                shell=True,
                bufsize=-1,
            )
            return True
        else:
            return

    def restart(self):
        """
        internal
        start/stop the proc
        """
        self.stop()
        self.start()

    def __write_to_server(self, data):
        serialized_request = json.dumps(data) + "\n"
        Client.server_handle.stdin.write(serialized_request)
        Client.server_handle.stdin.flush()

    def send_request(self, command, arguments=None):
        """
            Sends a properly formated request to the server
            :type command: string
            :type arguments: dict
            :type wait_for_response: boolean
        """
        request = self.build_request(command, arguments)
        self.__write_to_server(request)

        linecount = 0
        headers = {}
        while True:
            headerline = Client.server_handle.stdout.readline().strip()
            newline = Client.server_handle.stdout.readline().strip()
            content = Client.server_handle.stdout.readline().strip()
            ret = json.loads(content)

            # batch of ignore events.
            # TODO: refactor for a conditional loop

            # TS 1.9.x returns two reload finished responses
            if not self.isHigher(260) and self.isHigher(190):
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

    def send_command(self, command, arguments=None):
        request = self.build_request(command, arguments)
        self.__write_to_server(request)

    def build_request(self, command, arguments=None):
        request = {
            "seq": Client.__get_next_seq(),
            "type": "request",
            "command": command
        }
        if arguments:
            request['arguments'] = arguments
        return request

    def open(self, file):
        """
            Sends an "open" request

            :type file: string
        """
        args = {"file": file}
        self.send_command("open", args)

    def close(self, file):
        """
            Sends a "close" request

            :type file: string
        """
        args = {"file": file}
        self.send_command("close", args)

    def refresh(self):
        self.send_command("reloadProjects")

    def saveto(self, file, tmpfile):
        """
            Sends a "saveto" request

            :type file: string
            :type tmpfile: string
        """
        args = {"file": file, "tmpfile": tmpfile}
        self.send_command("saveto", args)

    def reload(self, file, tmpfile):
        """
            Sends a "reload" request

            :type file: string
            :type tmpfile: string
        """
        args = {"file": file, "tmpfile": tmpfile}
        response = self.send_request("reload", args)

        return response["success"] if response and "success" in response else False

    def getErr(self, files):
        args = {"files": files}
        response = self.send_request("geterr", args)
        return get_error_res_body(response)

    def syntacticDiagnosticsSync(self, file):
        args = {"file": file}
        response = self.send_request("syntacticDiagnosticsSync", args)
        return get_response_body(response)

    def semanticDiagnosticsSync(self, file):
        args = {"file": file}
        response = self.send_request("semanticDiagnosticsSync", args)
        return get_response_body(response)

    def getDocumentSymbols(self, file):
        args = {"file": file}
        response = self.send_request("navtree", args)
        return get_response_body(response)

    def getWorkspaceSymbols(self, file, term=''):
        args = {"file": file, "searchValue": term, "maxResultCount": 50}
        response = self.send_request("navto", args)
        return get_response_body(response)

    def getDoc(self, file, line, offset):
        """
            Sends a "quickinfo" request

            :type file: string
            :type line: number
            :type offset: number
        """
        args = {"file": file, "line": line, "offset": offset}
        response = self.send_request("quickinfo", args)
        return get_response_body(response)

    def getSignature(self, file, line, offset):
        """
            Sends a "signatureHelp" request

            :type file: string
            :type line: number
            :type offset: number
        """
        args = {"file": file, "line": line, "offset": offset}
        response = self.send_request("signatureHelp", args)
        return get_response_body(response)

    def getTypeDefinition(self, file, line, offset):
        """
            Sends a "signatureHelp" request

            :type file: string
            :type line: number
            :type offset: number
        """
        args = {"file": file, "line": line, "offset": offset}
        response = self.send_request("typeDefinition", args)
        return get_response_body(response)

    def getRef(self, file, line, offset):
        args = {"file": file, "line": line, "offset": offset}
        response = self.send_request("references", args)
        return get_response_body(response)

    def goToDefinition(self, file, line, offset):
        """
            Sends a "definition" request

            :type file: string
            :type line: number
            :type offset: number
        """
        args = {"file": file, "line": line, "offset": offset}
        response = self.send_request("definition", args)
        return get_response_body(response)

    def renameSymbol(self, file, line, offset):
        args = {"file": file, "line": line, "offset": offset,
                'findInComments': False, 'findInStrings': False}
        response = self.send_request("rename", args)
        return get_response_body(response)

    def completions(self, file, line, offset, prefix=""):
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

        response = self.send_request("completions", args)

        return get_response_body(response)

    def completion_entry_details(self, file, line, offset, entry_names):
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
        response = self.send_request("completionEntryDetails", args)
        return get_response_body(response)

    def projectInfo(self, file):
        args = {
            'file': file,
            'needFileNameList': 'false'
        }
        response = self.send_request("projectInfo", args)
        return get_response_body(response)


def get_error_res_body(response, default=[]):
    # Should we raise an error if success == False ?
    return response["body"]


def get_response_body(response, default=[]):
    success = bool(response) and "success" in response and response["success"]
    # Should we raise an error if success == False ?
    return response["body"] if success and "body" in response else default
