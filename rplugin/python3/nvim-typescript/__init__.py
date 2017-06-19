import sys
import os
import re
import json
import neovim
from time import time
from tempfile import NamedTemporaryFile
sys.path.insert(1, os.path.dirname(__file__))
from client import Client
from dir import Dir
RELOAD_INTERVAL = 1

"""
These default args are arbitrary
They could be anything, but this
is better than nothing. Feel free
to change to fit your needs
"""
defaultArgs = {
    "compilerOptions": {
        "target": "es2017",
        "module": "es6",
        "jsx": "preserve",
        "allowSyntheticDefaultImports": "true",
        "allowNonTsExtensions": "true",
        "allowJs": "true",
        "lib": ["dom", "es2015"]
    }
}


@neovim.plugin
class TypescriptHost(object):

    def __init__(self, vim):
        self.vim = vim
        self._client = Client(debug_fn=self.log, log_fn=self.log)
        self.files = Dir()
        self._last_input_reload = time()
        self.cwd = os.getcwd()

    def relative_file(self):
        """
            Return the current file
        """
        return self.vim.current.buffer.name

    def reload(self):
        """
            Call tsserver.reload()

        """
        filename = self.relative_file()
        contents = self.vim.eval("join(getline(1,'$'), \"\n\")")
        tmpfile = NamedTemporaryFile(delete=False)
        tmpfile.write(contents.encode("utf-8"))
        tmpfile.close()

        try:
            self._client.reload(filename, tmpfile.name)
        except:
            pass
        os.unlink(tmpfile.name)

    @neovim.function("TSFindConfig", sync=True)
    def findconfig(self, args):
        files = self.files.files()
        m = re.compile(r'(ts|js)config.json$')
        for file in files:
            if m.search(file):
                return True

    def writeFile(self):
        jsSupport = self.vim.eval('g:nvim_typescript#javascript_support')
        if bool(jsSupport):
            input = self.vim.call(
                'input', 'nvim-ts: config is not present, create one [yes|no]? ')
            if input == "yes":
                with open('jsconfig.json', 'w') as config:
                    json.dump(defaultArgs, config, indent=2,
                              separators=(',', ': '))
                    config.close()
                    self.vim.command('redraws')
                    self.vim.out_write(
                        'nvim-ts: js support was enable, but no config is present, writting defualt jsconfig.json \n')
                    self.tsstart()
            else:
                self.vim.command('redraws')
                self.vim.out_write('TSServer not started.')

    @neovim.command("TSStop")
    def tsstop(self):
        """
            Stop the client
        """
        if self._client.server_handle is not None:
            self._client.stop()
            self.vim.out_write('TS: Server Stopped \n')

    @neovim.command("TSStart")
    def tsstart(self):
        """
            Stat the client
        """
        if self._client.server_handle is None:
            self._client.serverPath = self.vim.vars[
                "nvim_typescript#server_path"]
            if self._client.start():
                self._client.open(self.relative_file())
                self.vim.out_write('TS: Server Started \n')

    @neovim.command("TSRestart")
    def tsrestart(self):
        """
            Restart the Client
        """
        self.tsstop()
        self.tsstart()

        # self._client.open(self.relative_file())

    @neovim.command("TSReloadProject")
    def reloadProject(self):
        self._client.refresh()

    @neovim.command("TSDoc")
    def tsdoc(self):
        """
            Get the doc strings and type info
        """
        if self._client.server_handle is not None:
            self.reload()
            file = self.vim.current.buffer.name
            line = self.vim.current.window.cursor[0]
            offset = self.vim.current.window.cursor[1] + 2
            info = self._client.getDoc(file, line, offset)

            if (not info) or (not info['success']):
                self.vim.command(
                    'echohl WarningMsg | echo "TS: No doc at cursor" | echohl None')
            else:
                displayString = '{0}'.format(info['body']['displayString'])
                documentation = '{0}'.format(info['body']['documentation'])
                documentation = documentation.split('\n')
                displayString = displayString.split('\n')
                message = displayString + documentation
                buf = self.vim.eval("bufnr('__doc__')")
                if buf > 0:
                    wi = self.vim.eval(
                        "index(tabpagebuflist(tabpagenr())," + str(buf) + ")")
                    if wi >= 0:
                        self.vim.command(str(wi + 1) + 'wincmd w')
                    else:
                        self.vim.command('sbuffer ' + str(buf))
                else:
                    self.vim.command("split __doc__")

                for setting in [
                        "setlocal modifiable",
                        "setlocal noswapfile",
                        "setlocal nonumber",
                        "setlocal buftype=nofile"
                ]:
                    self.vim.command(setting)
                self.vim.command('sil normal! ggdG')
                self.vim.command('resize 10')
                self.vim.current.buffer.append(message, 0)
                self.vim.command("setlocal nomodifiable")
                self.vim.command('sil normal! gg')
        else:
            self.vim.command(
                'echohl WarningMsg | echo "TS: Server is not Running" | echohl None')

    @neovim.command("TSDef")
    def tsdef(self):
        """
            Get the definition
        """
        if self._client.server_handle is not None:
            self.reload()
            file = self.vim.current.buffer.name
            line = self.vim.current.window.cursor[0]
            offset = self.vim.current.window.cursor[1] + 2
            info = self._client.goToDefinition(file, line, offset)
            if (not info) or (not info['success']):
                self.vim.command(
                    'echohl WarningMsg | echo "TS: No definition" | echohl None')
            else:
                defFile = info['body'][0]['file']
                defLine = '{0}'.format(info['body'][0]['start']['line'])

                self.vim.command('e +' + defLine + ' ' + defFile)
        else:
            self.vim.command(
                'echohl WarningMsg | echo "TS: Server is not Running" | echohl None')

    @neovim.command("TSDefPreview")
    def tsdefpreview(self):
        """
            Get the definition
        """
        if self._client.server_handle is not None:
            self.reload()
            file = self.vim.current.buffer.name
            line = self.vim.current.window.cursor[0]
            offset = self.vim.current.window.cursor[1] + 2
            info = self._client.goToDefinition(file, line, offset)
            if (not info) or (not info['success']):
                self.vim.command(
                    'echohl WarningMsg | echo "TS: No definition" | echohl None')
            else:
                defFile = info['body'][0]['file']
                defLine = '{0}'.format(info['body'][0]['start']['line'])

                self.vim.command('split! +' + defLine + ' ' + defFile)
        else:
            self.vim.command(
                'echohl WarningMsg | echo "TS: Server is not Running" | echohl None')

    @neovim.command("TSType")
    def tstype(self):
        """
            Get the type info
        """
        if self._client.server_handle is not None:
            self.reload()
            file = self.vim.current.buffer.name
            line = self.vim.current.window.cursor[0]
            offset = self.vim.current.window.cursor[1] + 2

            info = self._client.getDoc(file, line, offset)
            if (not info) or (not info['success']):
                pass
            else:
                message = '{0}'.format(info['body']['displayString'])
                message = re.sub("\s+", " ", message)
                self.vim.command('redraws!')
                self.vim.out_write(message + '\n')
        else:
            self.vim.command(
                'echohl WarningMsg | echo "TS: Server is not Running" | echohl None')

    @neovim.command("TSGetErr")
    def tsgeterr(self):
        """
            Get the type info
        """
        if self._client.server_handle is not None:
            self.reload()
            files = [self.relative_file()]
            getErrRes = self._client.getErr(files)
            if not getErrRes:
                pass
            else:
                errorLoc = []
                filename = getErrRes['body']['file']
                errorList = getErrRes['body']['diagnostics']

                if len(errorList) > -1:
                    for error in errorList:
                        errorLoc.append({
                            'filename': re.sub(self.cwd + '/', '', filename),
                            'lnum': error['start']['line'],
                            'col': error['start']['offset'],
                            'text': error['text']
                        })
                    self.vim.call('setloclist', 0, errorLoc, 'r', 'Errors')
                    self.vim.command('lwindow')
        else:
            self.printError('Server is not Running')

    # REQUEST NAVTREE/DOC SYMBOLS
    @neovim.function("TSGetDocSymbolsFunc", sync=True)
    def getDocSymbolsFunc(self, args=None):
        return self._client.getDocumentSymbols(self.relative_file())

    # Display Doc symbols in loclist
    @neovim.command("TSGetDocSymbols")
    def tsgetdocsymbols(self):
        if self._client.server_handle is not None:
            self.reload()
            docSysmbols = self.getDocSymbolsFunc()
            if not docSysmbols:
                pass
            else:
                docSysmbolsLoc = []
                symbolList = docSysmbols['body']['childItems']
                filename = re.sub(self.cwd + '/', '', self.relative_file())
                if len(symbolList) > -1:
                    for symbol in symbolList:
                        docSysmbolsLoc.append({
                            'filename': filename,
                            'lnum': symbol['spans'][0]['start']['line'],
                            'col':  symbol['spans'][0]['start']['offset'],
                            'text': symbol['text']
                        })

                    if 'childItems' in symbol and len(symbol['childItems']) > 0:
                        for childSymbol in symbol['childItems']:
                            docSysmbolsLoc.append({
                                'filename': filename,
                                'lnum': childSymbol['spans'][0]['start']['line'],
                                'col':  childSymbol['spans'][0]['start']['offset'],
                                'text': childSymbol['text']
                            })
                    self.vim.call('setloclist', 0,
                                  docSysmbolsLoc, 'r', 'Symbols')
                    self.vim.command('lwindow')
        else:
            self.printError('Server is not running')

    # REQUEST NAVTo/Workplace symbols
    # @neovim.function("TSGetWorkplaceSymbolsFunc", sync=True)
    # def getWorkplaceSymbolsFunc(self, args=None):
    #     return self._client.getWorkplaceSymbols(self.relative_file(), args[0])

    # Display Doc symbols in loclist
    # @neovim.command("TSGetDocSymbols")
    # def tsgetdocsymbols(self):
    #     if self._client.server_handle is not None:
    #         self.reload()
    #         docSysmbols = self.getDocSymbolsFunc()
    #         if not docSysmbols:
    #             pass
    #         else:
    #             docSysmbolsLoc = []
    #             symbolList = docSysmbols['body']['childItems']
    #             filename = re.sub(self.cwd + '/', '', self.relative_file())
    #             if len(symbolList) > -1:
    #                 for symbol in symbolList:
    #                     docSysmbolsLoc.append({
    #                         'filename': filename,
    #                         'lnum': symbol['spans'][0]['start']['line'],
    #                         'col':  symbol['spans'][0]['start']['offset'],
    #                         'text': symbol['text']
    #                     })
    #
    #                 if 'childItems' in symbol and len(symbol['childItems']) > 0:
    #                     for childSymbol in symbol['childItems']:
    #                         docSysmbolsLoc.append({
    #                             'filename': filename,
    #                             'lnum': childSymbol['spans'][0]['start']['line'],
    #                             'col':  childSymbol['spans'][0]['start']['offset'],
    #                             'text': childSymbol['text']
    #                         })
    #                 self.vim.call('setloclist', 0,
    #                               docSysmbolsLoc, 'r', 'Symbols')
    #                 self.vim.command('lwindow')
    #     else:
    #         self.printError('Server is not running')

    @neovim.command("TSSig")
    def tssig(self):
        """
            Get the type info
        """
        if self._client.server_handle is not None:
            self.reload()
            file = self.vim.current.buffer.name
            line = self.vim.current.window.cursor[0]
            offset = self.vim.current.window.cursor[1]
            info = self._client.getDoc(file, line, offset)
            if (not info) or (info['success'] is False):
                pass
            else:
                message = '{0}'.format(info['body']['displayString'])
                message = re.sub("\s+", " ", message)
                if 'method' in info['body']['kind']:
                    self.vim.command(
                        'redraws! | echom "nvim-ts: " | echohl Function | echon \"' + message + '\" | echohl None')
                else:
                    pass
        else:
            self.printError('Server is not running')

    @neovim.command("TSRefs")
    def tsrefs(self):
        """
            Get the type info
        """

        if self._client.server_handle is not None:
            self.reload()
            file = self.vim.current.buffer.name
            line = self.vim.current.window.cursor[0]
            offset = self.vim.current.window.cursor[1] + 2

            refs = self._client.getRef(file, line, offset)

            if (not refs) or (refs['success'] is False):
                pass
            else:
                truncateAfter = self.vim.eval('g:nvim_typescript#loc_list_item_truncate_after')
                location_list = []
                refList = refs["body"]["refs"]
                if len(refList) > -1:
                    for ref in refList:
                        lineText = re.sub('^\s+', '', ref['lineText'])
                        if (truncateAfter == -1) or (len(lineText) <= truncateAfter):
                            lineText
                        else :
                            lineText = (lineText[:truncateAfter] + '...')
                        location_list.append({
                            'filename': re.sub(self.cwd + '/', '', ref['file']),
                            'lnum': ref['start']['line'],
                            'col': ref['start']['offset'],
                            'text': lineText
                        })
                    self.vim.call('setloclist', 0, location_list,
                                  'r', 'References')
                    self.vim.command('lwindow')
                else:
                    self.printError('References not found')
        else:
            self.printError('Server is not Running')

    @neovim.function('TSGetServerPath')
    def tstest(self, args):
        """
        Get the path of the tsserver
        """
        self.vim.out_write(self._client.serverPath + '\n')

    @neovim.function('TSOnBufEnter')
    def on_bufenter(self, args=None):
        """
           Send open event when a ts file is open
        """
        if self.findconfig(None):
            if self._client.server_handle is None:
                self.tsstart()
            else:
                self._client.open(self.relative_file())
        else:
            self.writeFile()

    @neovim.function('TSOnBufSave')
    def on_bufwritepost(self, args=None):
        """
           On save, reload to detect changes
        """
        self.reload()

    # @neovim.function('TSComplete', sync=True)
    # def tsomnifunc(self, args):
    #     line_str = self.vim.current.line
    #     line = self.vim.current.window.cursor[0]
    #     offset = self.vim.current.window.cursor[1]
    #     if args[0]:
    #         while offset > 0 and re.match(r"([a-zA-Z])", line_str[offset - 1]):
    #             offset -= 1
    #         return offset
    #     else:
    #         if self._client.server_handle is not None:
    #             if time() - self._last_input_reload > RELOAD_INTERVAL or re.search(r"\w*\.", args[1]):
    #                 self._last_input_reload = time()
    #                 self.reload()
    #             data = self._client.completions(
    #                 self.relative_file(), line, offset + 1, args[1])
    #
    #             if len(data) == 0:
    #                 return []
    #
    #             if len(data) > self.vim.vars["nvim_typescript#max_completion_detail"]:
    #                 filtered = []
    #                 for entry in data:
    #                     if entry["kind"] != "warning":
    #                         filtered.append(entry)
    #                 return [self._convert_completion_data(e) for e in filtered]
    #
    #             names = []
    #             maxNameLength = 0
    #
    #             for entry in data:
    #                 if (entry["kind"] != "warning"):
    #                     names.append(entry["name"])
    #                     maxNameLength = max(maxNameLength, len(entry["name"]))
    #             detailed_data = self._client.completion_entry_details(
    #                 self.relative_file(), line, offset + 1, names)
    #             if len(detailed_data) == 0:
    #                 return []
    #
    #             return [self._convert_detailed_completion_data(e, padding=maxNameLength) for e in detailed_data]
    # def _convert_completion_data(self, entry):
    #     return {
    #         "word": entry["name"],
    #         "kind": entry["kind"]
    #     }
    # def _convert_detailed_completion_data(self, entry, padding=80):
    #     name = entry["name"]
    #     display_parts = entry["displayParts"]
    #     signature = "".join([p["text"] for p in display_parts])
    #
    #     # needed to strip new lines and indentation from the signature
    #     signature = re.sub("\s+", " ", signature)
    #     menu_text = re.sub(
    #         "^(var|let|const|class|\(method\)|\(property\)|enum|namespace|function|import|interface|type)\s+", "", signature)
    #     documentation = menu_text
    #
    #     if "documentation" in entry and entry["documentation"]:
    #         documentation += "\n" + \
    #             "".join([d["text"] for d in entry["documentation"]])
    #
    #     kind = entry["kind"][0].title()
    #
    #     return ({
    #         "word": name,
    #         "kind": kind,
    #         "menu": 'TS ' + menu_text,
    #         "info": documentation
    #     })

    def printError(self, message):
        self.vim.err_write(message + '\n')
        # self.vim.command(
        #     'echohl WarningMsg | echo "TS: ' + messagee + '" | echohl None')

    def log(self, message):
        """
        Log message to vim echo
        """
        val = "{}".format(message)
        # self.vim.command('redraws!')
        self.vim.out_write(val + '\n')
