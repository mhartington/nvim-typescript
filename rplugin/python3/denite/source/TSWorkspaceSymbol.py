#! /usr/bin/env python3

from operator import itemgetter
from .base import Base


class Source(Base):

    def __init__(self, vim):
        super().__init__(vim)
        self.vim = vim
        self.name = 'TSWorkspaceSymbol'
        self.kind = 'file'

    def on_init(self, context):
        context['is_interactive'] = True
        context['is_async'] = False
        context['file'] = self.vim.current.buffer.name

    def gather_candidates(self, context):
        if context['input']:
            res = self.vim.funcs.TSGetWorkspaceSymbolsFunc(
                context['input'], context['file'])
            if res is None:
                return []
            if res:
                values = list(map(lambda s: {
                    'abbr': " {0}\t{1}".format(s['text'], s['filename']),
                    'word': s['text'],
                    'action__line': s['lnum'],
                    "action__path": s['filename'],
                    "action__col": s['col'],
                }, res))
                return sorted(values, key=itemgetter('action__line'))
            return []
        else:
            return []
