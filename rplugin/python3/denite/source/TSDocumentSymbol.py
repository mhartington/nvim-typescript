#! /usr/bin/env python3

from operator import itemgetter
from .base import Base


class Source(Base):

    def __init__(self, vim):
        super().__init__(vim)
        self.vim = vim
        self.name = 'TSDocumentSymbol'
        self.kind = 'file'

    def getKind(self,kind):
        if kind in self.vim.vars["nvim_typescript#kind_symbols"].keys():
            return self.vim.vars["nvim_typescript#kind_symbols"][kind]
        else:
            return kind

    def convertToCandidate(self, symbols):
        candidates = []
        for symbol in symbols['childItems']:
            candidates.append({
                'text':  symbol['text'],
                'kindIcon': self.getKind(symbol['kind']),
                'lnum':  symbol['spans'][0]['start']['line'],
                'col':  symbol['spans'][0]['start']['offset']
            })
            if 'childItems' in symbol and len(symbol['childItems']) > 0:
                for childSymbol in symbol['childItems']:
                    candidates.append({
                        'text': childSymbol['text'] + ' - ' + symbol['text'],
                        'kindIcon': self.getKind(childSymbol['kind']),
                        'lnum': childSymbol['spans'][0]['start']['line'],
                        'col': childSymbol['spans'][0]['start']['offset']
                    })
        return candidates

    def gather_candidates(self, context):
        bufname = self.vim.current.buffer.name
        responce = self.vim.funcs.TSGetDocSymbolsFunc()
        if responce is None:
            return []

        candidates = self.convertToCandidate(responce)
        values = list(map(lambda symbol: {
            'abbr': "{0}\t{1}".format(symbol['kindIcon'], symbol['text']),
            'word': symbol['text'],
            'action__line': symbol['lnum'],
            "action__path": bufname,
            "action__col": symbol['col'],
        }, candidates))
        return sorted(values, key=itemgetter('action__line'))
