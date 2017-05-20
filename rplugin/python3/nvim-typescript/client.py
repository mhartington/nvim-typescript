import os
import sys
import json
import subprocess
from threading import Thread
from logging import getLogger
logger = getLogger('deoplete')


class Client(object):
    server_handle = None
    __server_seq = 1
    __project_directory = os.getcwd()
    __environ = os.environ.copy()

    def __init__(self, log_fn=None, debug_fn=None):
        self.log_fn = log_fn
        self.debug_fn = debug_fn
        Thread.__init__(self)

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
        self.send_request("exit")
        # Client.server_handle.kill()
        Client.server_handle = None

    def start(self):
        """
        start proc
        """
        if Client.server_handle:
            return
        # Client.__environ['TSS_LOG'] = "-logToFile true -file ./server.log"

        # Client.server_handle = run([sys.executable,self.serverPath], input=Client.__feeder, async=True, stdout=Capture())
        # Client.server_handle = pexpect.spawnu(self.serverPath)

        Client.server_handle = subprocess.Popen(
            [self.serverPath, "--disableAutomaticTypingAcquisition"],
            env=Client.__environ,
            cwd=Client.__project_directory,
            stdin=subprocess.PIPE,
            stdout=subprocess.PIPE,
            stderr=None,
            universal_newlines=True,
            shell=True,
            bufsize=-1,
            close_fds=True
        )
        return True

    def restart(self):
        """
        internal
        start/stop the proc
        """
        self.stop()
        self.start()

    def __send_data_to_server(self, data):
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
        self.__send_data_to_server(request)

        linecount = 0
        headers = {}
        while True:
            headerline = Client.server_handle.stdout.readline().strip()
            Client.server_handle.stdin.flush()
            logger.debug(headerline)
            linecount += 1

            if len(headerline):
                key, value = headerline.split(":", 2)
                headers[key.strip()] = value.strip()

                if "Content-Length" not in headers:
                    raise RuntimeError("Missing 'Content-Length' header")

                contentlength = int(headers["Content-Length"])
                returned_string = Client.server_handle.stdout.read(
                    contentlength)
                ret = json.loads(returned_string)

                # try:
                # TS 1.9.x returns two reload finished responses
                if ('body', {'reloadFinished': True}) in ret.items():
                    continue
                # TS 2.0.6 introduces configFileDiag event, ignore
                if ("event", "requestCompleted") in ret.items():
                    continue
                if ("event", "configFileDiag") in ret.items():
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
                # except:
                #     e = sys.exc_info()[0]
                #     logger.debug(e)

    def send_command(self, command, arguments=None):
        request = self.build_request(command, arguments)
        self.__send_data_to_server(request)

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
        return response

    def getDocumentSymbols(self, file):
        args = {"file": file}
        response = self.send_request("navtree", args)
        return response


    def getWorkplaceSymbols(self, file, term):
        args = {"file": file, "searchValue": term}
        # self.__log(args)
        response = self.send_request("navto", args)
        return response

    def getDoc(self, file, line, offset):
        """
            Sends a "quickinfo" request

            :type file: string
            :type line: number
            :type offset: number
        """
        args = {"file": file, "line": line, "offset": offset}
        response = self.send_request("quickinfo", args)

        return response

    def getSignature(self, file, line, offset):
        """
            Sends a "signatureHelp" request

            :type file: string
            :type line: number
            :type offset: number
        """
        args = {"file": file, "line": line, "offset": offset}
        response = self.send_request("signatureHelp", args)

        return response

    def getRef(self, file, line, offset):
        args = {"file": file, "line": line, "offset": offset}
        response = self.send_request("references", args)

        return response

    def goToDefinition(self, file, line, offset):
        """
            Sends a "definition" request

            :type file: string
            :type line: number
            :type offset: number
        """
        args = {"file": file, "line": line, "offset": offset}
        response = self.send_request("definition", args)
        return response

    def renameSymbol(self, file, line, offset):
        args = {"file": file, "line": line, "offset": offset,
                'findInComments': True, 'findInStrings': True}
        response = self.send_request("rename", args)
        return response

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

def get_response_body(response, default=[]):
    success = bool(response) and "success" in response and response[
        "success"]
    # Should we raise an error if success == False ?
    return response["body"] if success and "body" in response else default
