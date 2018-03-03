#! /usr/bin/env python3

import os
import re
import sys
from deoplete.source.base import Base
from deoplete.util import error


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
        self.rank = 1000
        self.min_pattern_length = 1
        self.input_pattern = r'(\.|::)\w*'

    def log(self, message):
        """
        Log message to vim echo
        """
        self.debug('************')
        self.debug('{} \n'.format(message))
        self.debug('************')

    def get_complete_position(self, context):
        m = re.search(r"\w*$", context['input'])
        return m.start() if m else -1

    def gather_candidates(self, context):
        try:
            offset = context["complete_position"] + 1,
            res = self.vim.funcs.TSComplete(context["complete_str"], offset)
            self.log(res)
            if len(res) == 0:
                return []
            return res
        except:
            return []
