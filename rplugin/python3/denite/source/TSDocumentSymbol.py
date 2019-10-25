#! /usr/bin/env python3

from operator import itemgetter
from denite.base.source import Base


class Source(Base):

    def __init__(self, vim):
        super().__init__(vim)
        self.vim = vim
        self.name = 'TSDocumentSymbol'
        self.kind = 'file'

    def getKind(self, kind):
        if kind in self.vim.vars["nvim_typescript#kind_symbols"].keys():
            return self.vim.vars["nvim_typescript#kind_symbols"][kind]
        else:
            return kind

    def convertToCandidate(self, symbols):
        candidates = []
        for symbol in symbols['childItems']:

            if 'alias' not in symbol.values():
                candidates.append({
                    'text': '{0} {1}'.format(self.getKind(symbol['kind']), symbol['text']),
                    'lnum': symbol['spans'][0]['start']['line'],
                    'col': symbol['spans'][0]['start']['offset']
                })
                if 'childItems' in symbol and len(symbol['childItems']) > 0:
                    for childSymbol in symbol['childItems']:
                        candidates.append({
                            'text': '\t {0} {1}'.format(self.getKind(childSymbol['kind']), childSymbol['text']),
                            'lnum': childSymbol['spans'][0]['start']['line'],
                            'col': childSymbol['spans'][0]['start']['offset']
                        })
                        if 'childItems' in childSymbol and len(childSymbol['childItems']) > 0:
                            for subSymbol in childSymbol['childItems']:
                                candidates.append({
                                    'text': '\t\t {0} {1}'.format(self.getKind(subSymbol['kind']), subSymbol['text']),
                                    'lnum': subSymbol['spans'][0]['start']['line'],
                                    'col': subSymbol['spans'][0]['start']['offset']
                                })
        return candidates

    def gather_candidates(self, context):
        bufname = self.vim.current.buffer.name
        response = self.vim.funcs.TSGetDocSymbolsFunc()
        if response is None:
            return []

        candidates = self.convertToCandidate(response)
        values = list(map(lambda symbol: {
            'abbr': "{0}".format(symbol['text']),
            'word': symbol['text'],
            'action__line': symbol['lnum'],
            "action__path": bufname,
            "action__col": symbol['col'],
        }, candidates))
        return sorted(values, key=itemgetter('action__line'))
