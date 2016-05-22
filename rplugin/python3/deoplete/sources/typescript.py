import os
import re
import json
import subprocess
import platform
from tempfile import NamedTemporaryFile
from deoplete.sources.base import Base

MAX_COMPLETION_DETAIL = 50


class Source(Base):

    # Base options
    def __init__(self, vim):
        Base.__init__(self, vim)

        # Deoplete related
        self.debug_enabled = True
        self.name = "typescript"
        self.filetypes = ["typescript"]
        self.mark = "TS"
        self.rank = 700
        self.input_pattern = r'\.\w*'

        # Project related
        self._project_directory = None
        self._sequenceid = 0
        self._current_file = None
        self._tsserver_handle = None

    # Start the server process
    def start_server(self):
        self.debug("Starting TSSERVER")
        self.search_tss_project_dir()

        self.debug(self._project_directory)
        env = None
        if platform.system() == 'Darwin':
            env = os.environ.copy()
            env['PATH'] += ':/usr/local/bin'
        self._tsserver_handle = subprocess.Popen("tsserver",
                cwd = self._project_directory,
                env = env,
                stdout = subprocess.PIPE,
                stdin = subprocess.PIPE,
                stderr = subprocess.STDOUT,
                universal_newlines = True,
                bufsize = 1)

        self.on_buffer()

    # Get the cwd
    def search_tss_project_dir(self):
        if not self._project_directory:
            directory = self.vim.eval("expand('%:p:h')")

            if not os.path.isdir(directory):
                return ''

            if directory:
                self._project_directory = directory
                while True:
                    parent = os.path.dirname(directory[:-1])

                    if not parent:
                        self._project_directory = self.vim.eval('getcwd()')
                        break

                    if os.path.isfile(os.path.join(directory, 'tsconfig.json')):
                        self._project_directory = directory
                        break
                    directory = parent

    # builds up the request and calls _write_message
    def _send_request( self, command, arguments = None, wait_for_response = False ):

        seq = self._next_sequence_id()
        request = {
            "seq":     seq,
            "type":    "request",
            "command": command
        }
        if arguments:
            request[ "arguments" ] = arguments

        # self.debug("_send_request: request: {0}".format(request))
        self._write_message(request)

        if not wait_for_response:
            return

        linecount = 0
        headers = {}
        while True:
            headerline = self._tsserver_handle.stdout.readline().strip()
            linecount += 1;
            if len(headerline):
                key, value = headerline.split( ":", 2 )
                headers[ key.strip() ] = value.strip()
                break

        if "Content-Length" not in headers:
            raise RuntimeError( "Missing 'Content-Length' header" )
        contentlength = int(headers["Content-Length"])
        return json.loads(self._tsserver_handle.stdout.read(contentlength))

    # increment sequence ids
    def _next_sequence_id(self):
        seq = self._sequenceid
        self._sequenceid += 1
        return seq

    # take the command build-up, and post it subprocess
    def _write_message(self, message):
        self._tsserver_handle.stdin.write(json.dumps(message))
        self._tsserver_handle.stdin.write("\n")

    #  Get the path to the project to set context.
    #  Needed to make tsconfig work.
    def relative_file(self):
        return self.vim.eval("expand('%:p')")

    # TODO: NOT SURE WHAT THIS IS
    def on_buffer(self):
        self._send_request("open", {
            "file": self.relative_file()
        });

    # Send a reload command to make tsserver update with context
    def _reload(self):
        contents = self.vim.eval("join(getline(1,'$'), \"\n\")")
        tmpfile = NamedTemporaryFile(delete = False)
        tmpfile.write(contents.encode('utf-8'))
        tmpfile.close()
        self._send_request('reload', {
            'file': self.relative_file(),
            'tmpfile': tmpfile.name
        })
        # os.unlink(tmpfile.name)

    # Get cursor position in the buffer
    def get_complete_position(self, context):
        m = re.search(r"\w*$", context["input"])
        return m.start() if m else -1

    # Gets completion, calls self._send_request
    def gather_candidates(self, context):
        # If the server is running, start it
        if self._tsserver_handle is None:
            self.start_server()

        # TODO: Calling reload here messes with completions
        # we end up firing reload multiple times and the context
        # keeps getting shifted.
        # self._reload()
        line = context["position"][1]
        col = context["complete_position"] + 1

        data = self._send_request("completions", {
            "file":   self.relative_file(),
            "line":   line,
            "offset": col,
            "prefix": context["complete_str"]
        }, wait_for_response = True)

        # exit early if no data
        if data is None or not "body" in data:
            return []

        # if there are too many entries, just return basic completion
        if len(data["body"]) > MAX_COMPLETION_DETAIL:
            return [self._convert_completion_data(e) for e in data["body"]]

        # build up more helpful completion data
        names = []
        maxNameLength = 0
        for entry in data["body"]:
            names.append(entry["name"])
            maxNameLength = max(maxNameLength, len(entry["name"]))

        detailed_data = self._send_request('completionEntryDetails', {
            "file":   self.relative_file(),
            "line":   line,
            "offset": col,
            "entryNames": names
        }, wait_for_response = True)

        if detailed_data is None or not "body" in detailed_data:
            return []

        return [self._convert_detailed_completion_data(e, padding = maxNameLength)
             for e in detailed_data["body"]]


    # If the results are over 100, return a simplified list
    def _convert_completion_data(self, entry):
        return {
            "word": entry["name"],
            "kind": entry["kind"]
            # "menu": entry["kindModifiers"]
            # "info": menu_text
        }

    # Under 100, provide more detail
    # TODO: Send method signature to preview window
    def _convert_detailed_completion_data(self, entry, padding = 80):
        # self.debug(entry)

        name = entry["name"]
        display_parts = entry['displayParts']
        signature = ''.join([p['text'] for p in display_parts])

        # needed to strip new lines and indentation from the signature
        signature = re.sub( '\s+', ' ', signature )
        menu_text = '{0} {1}'.format(name.ljust(padding), signature)
        self.debug(signature)
        return ({
            "word": name,
            "kind": entry["kind"],
            "info": menu_text
        })
