#! /usr/bin/env python3
from operator import itemgetter
import sys
import os
import re
from .base import Base

sys.path.insert(1, os.path.dirname(__file__) + '/../../nvim-typescript')

from client import Client
from utils import getKind


class Source(Base):

    def __init__(self, vim):
        super().__init__(vim)
        self.vim = vim
        self._client = Client()
        self.name = 'TSProjectFiles'
        self.kind = 'file'

    def convertToCandidate(self, symbols):
        return list(map(lambda symbol: {
            'text':  symbol,
        }, symbols))

    def gather_candidates(self, context):
        cwd = os.getcwd()
        bufname = self.vim.current.buffer.name
        responce = self._client.projectInfo(bufname)
        if responce is None:
            return []
        candidates = self.convertToCandidate(responce['fileNames'])
        return list(map(lambda symbol: {
            'word': re.sub(cwd + '/', '', symbol['text']),
            'action__path': symbol['text']
        }, candidates))
