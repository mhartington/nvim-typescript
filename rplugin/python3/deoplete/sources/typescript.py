import os
import re
import json
import subprocess
import platform
from tempfile import NamedTemporaryFile
from deoplete.sources.base import Base

MAX_COMPLETION_DETAIL = 100


class Source(Base):
    def __init__(self, vim):
        Base.__init__(self, vim)

        self.debug_enabled = True
        self.name = "typescript"
        self.mark = "[ts]"
        self.filetypes = ["typescript"]
        # self.input_pattern = "\."
        self.input_pattern = r'\.\w*'
        self._project_directory = None
        self._sequenceid = 0
        self._current_file = None
        self._tsserver_handle = None

    # Start the server process
    def _start_server(self):

        self._search_tern_project_dir()
        self.debug('getting project directory')
        env = None
        if platform.system() == 'Darwin':
            env = os.environ.copy()
            env['PATH'] += ':/usr/local/bin'
        self._tsserver_handle = subprocess.Popen("tsserver",
                cwd=self._project_directory,env=env,
                stdout = subprocess.PIPE,
                stdin = subprocess.PIPE,
                stderr = subprocess.STDOUT,
                universal_newlines = True,
                bufsize = 1)
    # Get the cwd
    def _search_tern_project_dir(self):
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

        self.debug(self._project_directory)
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

    def _next_sequence_id(self):
        seq = self._sequenceid
        self._sequenceid += 1
        return seq

    def _write_message(self, message):
        self._tsserver_handle.stdin.write(json.dumps(message))
        self._tsserver_handle.stdin.write("\n")

    def relative_file(self):
        return self.vim.eval("expand('%:p')")

    def on_event(self, context):
        self.debug(context)
        self._start_server()
        self._send_request("open", {
            "file": self.relative_file()
        });

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

    def get_complete_position(self, context):
        m = re.search(r"\w*$", context["input"])
        return m.start() if m else -1
    # Gets completion, calls self._send_request
    def gather_candidates(self, context):

        self.debug("\n")

        self._reload()

        line = context["position"][1]
        col = context["complete_position"] + 1

        data = self._send_request("completions", {
            "file":   self.relative_file(),
            "line":   line,
            "offset": col,
            "prefix": context["complete_str"]
        }, wait_for_response = True)

        # exit early if no data
        self.debug(data)
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

        self.debug(detailed_data)
        if detailed_data is None or not "body" in detailed_data:
            return []

        return [self._convert_detailed_completion_data(e, padding = maxNameLength)
             for e in detailed_data["body"]]

    def _convert_completion_data(self, entry):
        return {
            "word": entry["name"],
            "kind": entry["kind"],
            "menu": entry["kindModifiers"]
        }

    def _convert_detailed_completion_data(self, entry, padding = 80):
        self.debug(entry)

        name = entry["name"]
        display_parts = entry['displayParts']
        signature = ''.join([p['text'] for p in display_parts])

        # needed to strip new lines and indentation from the signature
        signature = re.sub( '\s+', ' ', signature )
        menu_text = '{0} {1}'.format(name.ljust(padding), signature)
        return ({
            "word": name,
            "kind": entry["kind"],
            "menu": menu_text
        })
