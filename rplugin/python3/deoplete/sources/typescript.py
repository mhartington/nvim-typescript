import deoplete.util

from .base import Base

class Source(Base):
    def __init__(self, vim):
        Base.__init__(self, vim)

        self.name = 'typescript'
        self.mark = '[TS]'
        self.filetypes = ['typescript']
        self.input_pattern = '\.'
        self.is_bytepos = True

    def get_complete_position(self, context):
        return self.vim.call('tsuquyomi#complete', 1, 0)

    def gather_candidates(self, context):
        return self.vim.call('tsuquyomi#complete', 0, 0)
