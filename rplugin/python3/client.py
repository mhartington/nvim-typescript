import os
import json
import subprocess


class Client:
    __server_handle = None
    __server_seq = 0
    __project_directory = os.getcwd()
    __environ = os.environ.copy()

    def __init__(self, log_fn=None, debug_fn=None):
        self.log_fn = log_fn
        self.debug_fn = debug_fn

    @classmethod
    def __get_next_seq(cls):
        seq = cls.__server_seq
        cls.__server_seq += 1
        return seq

    def __log(self, message):
        if self.log_fn:
            self.log_fn(message)

    def __debug(self, message):
        if self.debug_fn:
            self.debug_fn(message)

    def __start_server(self):
        if Client.__server_handle:
            return

        Client.__server_handle = subprocess.Popen(
            "tsserver",
            env=Client.__environ,
            cwd=Client.__project_directory,
            stdout=subprocess.PIPE,
            stdin=subprocess.PIPE,
            stderr=subprocess.STDOUT,
            universal_newlines=True,
            shell=True,
            bufsize=1
        )

        self.__log("TSServer started")

    def __send_data_to_server(self, data):
        Client.__server_handle.stdin.write(json.dumps(data))
        Client.__server_handle.stdin.write("\n")

    def __get_response_body(self, response, default=[]):
        success = bool(response) and "success" in response and response[
            "success"]

        # Should we raise an error if success == False ?

        return response["body"] if success and "body" in response else default

    def send_request(self, command, arguments=None, wait_for_response=False):
        """
            Sends a properly formated request to the server

            :type command: string
            :type arguments: dict
            :type wait_for_response: boolean
        """
        # Make sure server is started
        self.__start_server()

        # Load next seq id
        seq = Client.__get_next_seq()

        # Build request
        request = {
            "seq": seq,
            "type": "request",
            "command": command
        }

        # Add arguments if provided
        if arguments:
            request["arguments"] = arguments

        self.__debug("Request: {}".format(json.dumps(request)))

        # Send request
        self.__send_data_to_server(request)

        if not wait_for_response:
            return

        linecount = 0
        headers = {}

        while True:
            headerline = Client.__server_handle.stdout.readline().strip()
            linecount += 1

            if len(headerline):
                key, value = headerline.split(":", 2)
                headers[key.strip()] = value.strip()

                # Response should contain a "Content-Length" header
                if "Content-Length" not in headers:
                    raise RuntimeError("Missing 'Content-Length' header")

                # Read response content
                contentlength = int(headers["Content-Length"])
                ret_str = Client.__server_handle.stdout.read(contentlength)

                self.__debug("Response: {}".format(ret_str))

                ret = json.loads(ret_str)

                # Each response should contain a "request_seq"
                if "request_seq" not in ret or ret["request_seq"] > seq:
                    return None
                elif ret["request_seq"] == seq:
                    return ret

    def open(self, file):
        """
            Sends an "open" request

            :type file: string
        """
        args = {"file": file}
        self.send_request("open", args)

    def close(self, file):
        """
            Sends a "close" request

            :type file: string
        """
        args = {"file": file}
        self.send_request("close", args)

    def saveto(self, file, tmpfile):
        """
            Sends a "saveto" request

            :type file: string
            :type tmpfile: string
        """
        args = {"file": file, "tmpfile": tmpfile}
        self.send_request("saveto", args)

    def reload(self, file, tmpfile):
        """
            Sends a "reload" request

            :type file: string
            :type tmpfile: string
        """
        args = {"file": file, "tmpfile": tmpfile}
        response = self.send_request("reload", args, True)

        return response["success"] if response and "success" in response else False

    def getDoc(self, file, line, offset):
        """
            Sends a "quickinfo" request

            :type file: string
            :type line: number
            :type offset: number
        """
        args = {"file": file, "line": line, "offset": offset}
        response = self.send_request("quickinfo", args, True)

        return response

    def goToDefinition(self, file, line, offset):
        """
            Sends a "definition" request

            :type file: string
            :type line: number
            :type offset: number
        """
        args = {"file": file, "line": line, "offset": offset}
        response = self.send_request("definition", args, True)
        return response

    def renameSymbol(self, file, line, offset):
        args = {"file": file, "line": line, "offset": offset,
                'findInComments': True, 'findInStrings': True}
        response = self.send_request("rename", args, True)
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

        response = self.send_request(
            "completions", args, wait_for_response=True)

        return self.__get_response_body(response)

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

        response = self.send_request(
            "completionEntryDetails", args, wait_for_response=True)

        return self.__get_response_body(response)
