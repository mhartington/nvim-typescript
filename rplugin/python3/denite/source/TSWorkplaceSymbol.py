from .base import Base


class Source(Base):

    def __init__(self, vim):
        super().__init__(vim)

        self.name = 'TSWorkplaceSymbol'
        self.kind = 'file'

    def convertToCandidate(self, symbols):
        # candidates = []
        # for symbol in symbols['body']:
        #     name = symbol['name']
        #     kind = symbol['kind']
        #     lnum = symbol['line']['start']
        #     col = symbol['start']['offset']
        #     file = symbol['file']
        #     candidates.append({
        #         "word": "{} \t{}".format(name),
        #         "action__path": file,
        #         "action__line": lnum,
        #         "action__col": col,
        #     })
        return candidates
    def on_init(self, context):
        context['__bufname'] = self.vim.current.buffer.name
        context['is_interactive'] = True
        context['is_async'] = False

    def gather_candidates(self, context):
        # self.vim.out_write(str(context["input"]) + '\n')
        symbols = self.vim.call('TSGetWorkplaceSymbolsFunc', context['input'])
        # if symbols is None:
        #     return []

        self.vim.out_write(str(symbols) + '\n')
        # return self.convertToCandidate(symbols)
        return []
