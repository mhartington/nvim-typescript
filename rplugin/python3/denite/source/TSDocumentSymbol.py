#! /usr/bin/env python3
from operator import itemgetter
import sys
import os
from .base import Base

sys.path.insert(1, os.path.dirname(__file__) + '/../../nvim_typescript')

from client import Client
from utils import getKind


class Source(Base):

    def __init__(self, vim):
        super().__init__(vim)
        self.vim = vim
        self._client = Client()
        self.name = 'TSDocumentSymbol'
        self.kind = 'file'

    def convertToCandidate(self, symbols):
        candidates = []
        for symbol in symbols['childItems']:
            candidates.append({
                'text':  symbol['text'],
                'kindIcon': getKind(self.vim, symbol['kind']),
                'lnum':  symbol['spans'][0]['start']['line'],
                'col':  symbol['spans'][0]['start']['offset']
            })
            if 'childItems' in symbol and len(symbol['childItems']) > 0:
                for childSymbol in symbol['childItems']:
                    candidates.append({
                        'text': childSymbol['text'] + ' - ' + symbol['text'],
                        'kindIcon': getKind(self.vim, childSymbol['kind']),
                        'lnum': childSymbol['spans'][0]['start']['line'],
                        'col': childSymbol['spans'][0]['start']['offset']
                    })
        return candidates

    def gather_candidates(self, context):
        #context['is_interactive	']=True
        bufname = self.vim.current.buffer.name
        responce = self._client.getDocumentSymbols(bufname)
        if responce is None:
            return []

        candidates = self.convertToCandidate(responce)
        values = list(map(lambda symbol: {
            'abbr': " {0}\t{1}".format(symbol['kindIcon'], symbol['text']),
            'word': symbol['text'],
            'action__line': symbol['lnum'],
            "action__path": bufname,
            "action__col": symbol['col'],
        }, candidates))
        return sorted(values, key=itemgetter('action__line'))
