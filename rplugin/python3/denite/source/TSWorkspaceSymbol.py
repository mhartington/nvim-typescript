#! /usr/bin/env python3

from .base import Base
from operator import itemgetter
import re
import sys
import os

sys.path.insert(1, os.path.dirname(__file__) + '/../../nvim_typescript')

import client
from utils import getKind


class Source(Base):

    def __init__(self, vim):
        super().__init__(vim)
        self.vim = vim
        self._client = client
        self.name = 'TSWorkspaceSymbol'
        self.kind = 'file'

    def on_init(self, context):
        context['__bufname'] = self.vim.current.buffer.name
        context['is_interactive'] = True
        context['is_async'] = False
        context['cwd'] = os.getcwd()

    def convertToCandidate(self, symbols, context):
        return list(map(lambda symbol: {
            't':  symbol['name'],
            'i': getKind(self.vim, symbol['kind']),
            'l':  symbol['start']['line'],
            'c':  symbol['start']['offset'],
            'f': re.sub(context['cwd'] + '/', '', symbol['file'])
        }, symbols))

    def gather_candidates(self, context):
        res = self._client.getWorkspaceSymbols(
            context['__bufname'], context['input'])
        if res is None:
            return []
        candidates = self.convertToCandidate(res, context)
        if candidates:
            values = list(map(lambda s: {
                'abbr': " {0}\t{1}\t{2}".format(s['i'], s['t'], s['f']),
                'word': s['t'],
                'action__line': s['l'],
                "action__path": s['f'],
                "action__col": s['c'],
            }, candidates))
            return sorted(values, key=itemgetter('action__line'))
        return []
