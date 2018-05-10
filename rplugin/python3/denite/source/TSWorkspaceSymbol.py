#! /usr/bin/env python3

import os
import re
import sys
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
        context['cwd'] = os.getcwd()

    def convertToCandidate(self, symbols, context):
        return list(map(lambda symbol: {
            't': symbol['name'],
            'i': symbol['kind'],
            'l': symbol['start']['line'],
            'c': symbol['start']['offset'],
            'f': symbol['file']
        }, symbols))

    def gather_candidates(self, context):
        # self.vim.out_write('{} \n'.format([context['input']]))
        res = self.vim.call('TSGetWorkspaceSymbolsFunc', context['input'])
        return []
        # if res is None:
        #     return []
        # candidates = self.convertToCandidate(res, context)
        # if candidates:
        #     values = list(map(lambda s: {
        #         'abbr': " {0}\t{1}\t{2}".format(s['i'], s['t'], s['f']),
        #         'word': s['t'],
        #         'action__line': s['l'],
        #         "action__path": s['f'],
        #         "action__col": s['c'],
        #     }, candidates))
        #     return sorted(values, key=itemgetter('action__line'))
        # return []
