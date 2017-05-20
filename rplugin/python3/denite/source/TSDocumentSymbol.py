#! /usr/bin/env python3
from operator import itemgetter

from .base import Base

class Source(Base):

    def __init__(self, vim):
        super().__init__(vim)

        self.name = 'TSDocumentSymbol'
        self.kind = 'file'

    def get_kind(self, kind):
        if kind in self.vim.vars["nvim_typescript#kind_symbols"].keys():
            return self.vim.vars["nvim_typescript#kind_symbols"][kind]
        else:
            return kind

    def convertToCandidate(self, symbols):
        candidates = []
        for symbol in symbols['body']['childItems']:
            candidates.append({
                'text':  symbol['text'],
                'kindIcon': self.get_kind(symbol['kind']),
                'lnum':  symbol['spans'][0]['start']['line'],
                'col':  symbol['spans'][0]['start']['offset']
            })
            if 'childItems' in symbol and len(symbol['childItems']) > 0:
                for childSymbol in symbol['childItems']:
                    candidates.append({
                        'text': childSymbol['text'] + ' - ' + symbol['text'],
                        'kindIcon': self.get_kind(childSymbol['kind']),
                        'lnum': childSymbol['spans'][0]['start']['line'],
                        'col': childSymbol['spans'][0]['start']['offset']
                    })
        return candidates

    def gather_candidates(self, context):
        context['is_interactive	'] = True
        symbols = self.vim.call('TSGetDocSymbolsFunc')
        if symbols is None:
            return []
        bufname = self.vim.current.buffer.name
        candidates = self.convertToCandidate(symbols)
        padding = max(range(len(candidates)),
                      key=lambda index: candidates[index]['kindIcon']) + 1
        values = []
        for symbol in candidates:
            values.append({
                'abbr': " {0}\t{1}".format(symbol['kindIcon'].ljust(padding), symbol['text']),
                'word': symbol['text'],
                'action__line': symbol['lnum'],
                "action__path": bufname,
                "action__col": symbol['col'],
            })
        return sorted(values, key=itemgetter('action__line'))
