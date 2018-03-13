#! /usr/bin/env python3

import os
import re
import sys
from deoplete.source.base import Base
from deoplete.util import error
from tempfile import NamedTemporaryFile

sys.path.insert(1, os.path.join(os.path.dirname(__file__), '..','..', 'nvim_typescript'))

import client
from utils import convert_completion_data, convert_detailed_completion_data


class Source(Base):

    # Base options
    def __init__(self, vim):
        Base.__init__(self, vim)
        self.name = "typescript"
        self.mark = self.vim.vars['nvim_typescript#completion_mark']
        self.filetypes = ["typescript", "tsx", "typescript.tsx", "javascript", "jsx", "javascript.jsx"] \
            if self.vim.vars["nvim_typescript#javascript_support"] \
            else ["typescript", "tsx", "typescript.tsx", "vue"] \
            if self.vim.vars["nvim_typescript#vue_support"] \
            else ["typescript", "tsx", "typescript.tsx"]
        self._max_completion_detail = self.vim.vars["nvim_typescript#max_completion_detail"]

        self.rank = 1000
        self.min_pattern_length = 1
        self.input_pattern = r'(\.|::)\w*'

        client.setServerPath(self.vim.vars["nvim_typescript#server_path"])
        if client.start():
            client.setTsConfigVersion()
            client.open(self.relative_file())

    def log(self, message):
        """
        Log message to vim echo
        """
        self.debug('************')
        self.debug('{} \n'.format(message))
        self.debug('************')

    def relative_file(self):
        if not self.vim.current.buffer.name:
            if len(self.vim.buffers) > 0:
                return self.vim.buffers[1].name
        else:
            return self.vim.current.buffer.name

    def reload(self):
        """
        Call tsserver.reload()
        """
        filename = self.relative_file()
        contents = self.vim.eval("join(getline(1,'$'), \"\n\")")
        tmpfile = NamedTemporaryFile(delete=False)
        tmpfile.write(contents.encode("utf-8"))
        tmpfile.close()

        try:
            client.reload(filename, tmpfile.name)
        except:
            pass
        os.unlink(tmpfile.name)

    def get_complete_position(self, context):
        m = re.search(r"\w*$", context['input'])
        return m.start() if m else -1

    def gather_candidates(self, context):
        # try:
        #     if not context["is_async"]:
        #         context["is_async"] = True
        #         offset = context["complete_position"] + 1,
        #         res = self.vim.funcs.TSComplete(context["complete_str"], offset)
        #         if len(res) == 0:
        #             return []
        #         context['is_async'] = False
        #         return res
        # except:
        #     return []
        try:
            self.reload()
            data = client.completions(
                file=self.relative_file(),
                line=context["position"][1],
                offset=context["complete_position"] + 1,
                prefix=context["complete_str"]
            )
            # self.log(data)
            if len(data) == 0:
                return []

            if len(data) > self._max_completion_detail:
                filtered = []
                for entry in data:
                    if entry["kind"] != "warning":
                        filtered.append(entry)
                return [convert_completion_data(e, self.vim) for e in filtered]

            names = []
            maxNameLength = 0

            for entry in data:
                if entry["kind"] != "warning":
                    names.append(entry["name"])
                    maxNameLength = max(maxNameLength, len(entry["name"]))

            detailed_data = client.completion_entry_details(
                file=self.relative_file(),
                line=context["position"][1],
                offset=context["complete_position"] + 1,
                entry_names=names
            )

            if len(detailed_data) == 0:
                return []

            return [convert_detailed_completion_data(e, self.vim) for e in detailed_data]
        except:
            return []
