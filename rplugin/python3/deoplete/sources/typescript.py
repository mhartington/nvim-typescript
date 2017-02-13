import os
import re
import sys
import platform
import itertools

from time import time
from tempfile import NamedTemporaryFile
from deoplete.source.base import Base

sys.path.insert(1, os.path.dirname(__file__) + '/../../nvim-typescript')

from client import Client

RELOAD_INTERVAL = 1
RESPONSE_TIMEOUT_SECONDS = 20


class Source(Base):

    # Base options
    def __init__(self, vim):
        Base.__init__(self, vim)

        # Deoplete related
        self.debug_enabled = True
        self.name = "typescript"
        self.mark = "TS"
        self.filetypes = ["typescript", "tsx", "typescript.tsx", "javascript", "jsx", "javascript.jsx"] if self.vim.vars[
            "nvim_typescript#javascript_support"] else ["typescript", "tsx", "typescript.tsx"]
        self.rank = 1000
        self.input_pattern = r"\.\w*"
        self._last_input_reload = time()
        # pylint: disable=locally-disabled, line-too-long
        self._max_completion_detail = self.vim.eval(
            "g:nvim_typescript#max_completion_detail")

        # TSServer client
        self._client = Client(debug_fn=self.debug, log_fn=self.log)

    def log(self, message):
        """
        Log message to vim echo
        """
        self.vim.command("echom '{}'".format(re.sub("'", "\'", message)))

    def reload(self):
        """
        send a reload request
        """
        filename = self.relative_file()
        contents = self.vim.eval("join(getline(1,'$'), \"\n\")")

        tmpfile = NamedTemporaryFile(delete=False)
        tmpfile.write(contents.encode("utf-8"))
        tmpfile.close()

        self._client.reload(filename, tmpfile.name)

        os.unlink(tmpfile.name)

    def relative_file(self):
        """
        returns the relative file
        """
        return self.vim.current.buffer.name

    def get_complete_position(self, context):
        """
        returns the cursor position
        """
        m = re.search(r"\w*$", context["input"])
        return m.start() if m else -1

    def gather_candidates(self, context):
        """
        Main deoplete method
        returns completions from client.py
        """
        # reload if last reload expired or input completion is a method extraction
        # pylint: disable=locally-disabled, line-too-long
        if time() - self._last_input_reload > RELOAD_INTERVAL or re.search(r"\w*\.", context["input"]):
            self._last_input_reload = time()
            self.reload()

        data = self._client.completions(
            file=self.relative_file(),
            line=context["position"][1],
            offset=context["complete_position"] + 1,
            prefix=context["complete_str"]
        )

        if len(data) == 0:
            return []

        if len(data) > self._max_completion_detail:
            filtered = []
            for entry in data:
                if entry["kind"] != "warning":
                    filtered.append(entry)
            return [self._convert_completion_data(e) for e in filtered]

        names = []
        maxNameLength = 0

        for entry in data:
            if (entry["kind"] != "warning"):
                names.append(entry["name"])
                maxNameLength = max(maxNameLength, len(entry["name"]))

        detailed_data = self._client.completion_entry_details(
            file=self.relative_file(),
            line=context["position"][1],
            offset=context["complete_position"] + 1,
            entry_names=names
        )

        if len(detailed_data) == 0:
            return []

        return [self._convert_detailed_completion_data(e, padding=maxNameLength)
                for e in detailed_data]

    def _convert_completion_data(self, entry):
        return {
            "word": entry["name"],
            "kind": entry["kind"]
        }

    def _convert_detailed_completion_data(self, entry, padding=80):
        name = entry["name"]
        display_parts = entry["displayParts"]
        signature = "".join([p["text"] for p in display_parts])

        # needed to strip new lines and indentation from the signature
        signature = re.sub("\s+", " ", signature)
        menu_text = re.sub(
            "^(var|let|const|class|\(method\)|\(property\)|enum|namespace|function|import|interface|type)\s+", "", signature)
        documentation = menu_text

        if "documentation" in entry and entry["documentation"]:
            documentation += "\n" + \
                "".join([d["text"] for d in entry["documentation"]])

        kind = entry["kind"][0].title()

        return ({
            "word": name,
            "kind": kind,
            "menu": menu_text,
            "info": documentation
        })
