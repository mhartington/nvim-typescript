from .base import Base
from operator import itemgetter
import re
import sys
import os

sys.path.insert(1, os.path.dirname(__file__) + '/../../nvim-typescript')

from client import Client
from utils import getKind


class Source(Base):

    def __init__(self, vim):
        super().__init__(vim)
        self.vim = vim
        self._client = Client()
        self.name = 'TSWorkspaceSymbol'
        self.kind = 'file'

    def on_init(self, context):
        context['__bufname'] = self.vim.current.buffer.name
        context['is_interactive'] = True
        context['is_async'] = False

    def convertToCandidate(self, symbols):
        cwd = os.getcwd()
        return list(map(lambda symbol: {
            'text':  symbol['name'],
            'kindIcon': getKind(self.vim, symbol['kind']),
            'lnum':  symbol['start']['line'],
            'col':  symbol['start']['offset'],
            'file': re.sub(cwd + '/', '', symbol['file'])
        }, symbols))

    def gather_candidates(self, context):
        res = self._client.getWorkspaceSymbols(
            context['__bufname'], context['input'])
        if res is None:
            return []
        else:
            candidates = self.convertToCandidate(res)
            if candidates:
                values = list(map(lambda symbol: {
                    'abbr': " {0}\t{1}\t{2}".format(symbol['kindIcon'], symbol['text'], symbol['file']),
                    'word': symbol['text'],
                    'action__line': symbol['lnum'],
                    "action__path": symbol['file'],
                    "action__col": symbol['col'],
                }, candidates))
                return sorted(values, key=itemgetter('action__line'))
            return []
