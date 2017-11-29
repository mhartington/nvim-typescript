import sys
import os
import re
import json
import neovim
from time import time
from tempfile import NamedTemporaryFile
sys.path.insert(1, os.path.dirname(__file__))
from client import Client
import utils
RELOAD_INTERVAL = 1

@neovim.plugin
class TypescriptHost(object):

    def __init__(self, vim):
        self.vim = vim
        self._client = Client(debug_fn=self.log, log_fn=self.log)
        self._last_input_reload = time()
        self.cwd = os.getcwd()
        self.highlight_source = 0

    def relative_file(self):
        """
        Return the current file
        If the currently focused buffer is not a proper buffer
        (eg. location list window or quickfix window) `self.vim.current.buffer.name`
        returns a None value.
        In this case, do a best effort and return any buffer name.
        This is obviously not optimal, but for lack of a better solution...""
        """
        if not self.vim.current.buffer.name:
            if len(self.vim.buffers) > 0:
                # Vim buffer numbers are 1-indexed
                return self.vim.buffers[1].name
        else:
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

    @neovim.command("TSStop")
    def tsstop(self):
        """
        Stop the client
        """
        if self._client.server_handle is not None:
            self.printMsg('Server Stopped')

    @neovim.command("TSStart")
    def tsstart(self):
        """
        Stat the client
        """
        if self._client.server_handle is None:
            self._client.serverPath = self.vim.vars[
                "nvim_typescript#server_path"]
            if self._client.start():
                self._client.setTsConfig()
                self._client.open(self.relative_file())
                self.printMsg('Server Started')

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

            if info:
                displayString = '{0}'.format(info['displayString'])
                documentation = '{0}'.format(info['documentation'])
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
            self.printError('Server is not running')

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
            if info:
                defFile = info[0]['file']
                defLine = '{0}'.format(info[0]['start']['line'])
                self.vim.command('e +' + defLine + ' ' + defFile)
            else:
                self.printError('No definition')
        else:
            self.printError('Server is not running')

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
            if info:
                defFile = info[0]['file']
                defLine = '{0}'.format(info[0]['start']['line'])
                self.vim.command('split! +' + defLine + ' ' + defFile)
            else:
                self.printError('No definition')
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
            if info:
                message = '{0}'.format(info['displayString'])
                message = re.sub("\s+", " ", message)
                self.vim.out_write("{} \n".format(message))
        else:
            self.printError('Server is not running')

    @neovim.command("TSTypeDef")
    def tstypedef(self):
        if self._client.server_handle is not None:
            self.reload()
            file = self.vim.current.buffer.name
            line = self.vim.current.window.cursor[0]
            offset = self.vim.current.window.cursor[1] + 2
            typeDefRes = self._client.getTypeDefinition(file, line, offset)

            if typeDefRes:
                defFile = typeDefRes[0]['file']
                defLine = '{0}'.format(typeDefRes[0]['start']['line'])
                self.vim.command('e +' + defLine + ' ' + defFile)
        else:
            self.printError('Server is not running')

    def reportErrors(self, errors):
        self.vim.call('setloclist', 0, errors, 'r', 'Errors')
        buf = self.vim.current.buffer
        bufname = buf.name
        if (self.highlight_source == 0):
            self.highlight_source = self.vim.new_highlight_source()
        buf.clear_highlight(self.highlight_source)
        for e in errors:
            if e['filename'] == bufname:
                # highlight to end of line if the error goes past the line
                end = e['end']['offset'] - \
                    1 if e['end']['line'] == e['lnum'] else -1
                buf.add_highlight(
                    'ERROR',  # highlight group
                    # annoyingly this command is 0-indexed unlike the location
                    # list
                    e['lnum'] - 1,
                    # annoyingly this command is 0-indexed unlike the location
                    # list
                    e['col'] - 1,
                    end,
                    src_id=self.highlight_source
                )

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
                filename = getErrRes['file']

                self.reportErrors([{
                    'filename': re.sub(self.cwd + '/', '', filename),
                    'lnum': e['start']['line'],
                    'col': e['start']['offset'],
                    'end': e['end'],
                    'text': e['text']
                } for e in getErrRes['diagnostics']])
        else:
            self.printError('Server is not Running')

    @neovim.command("TSSyncErr")
    def tssyncerr(self, args=None):
        """
            Use syntacticDiagnosticsSync and semanticDiagnosticsSync to quickly load errors for the
            current file.
        """
        if self._client.server_handle is not None:
            self.reload()
            f = self.relative_file()
            syntacticRes = self._client.syntacticDiagnosticsSync(f)
            semanticRes = self._client.semanticDiagnosticsSync(f)
            if syntacticRes == None or semanticRes == None:
                pass
            else:
                self.reportErrors([{
                    'text': d['text'],
                    'lnum': d['start']['line'],
                    'col': d['start']['offset'],
                    'end': d['end'],
                    'filename': f
                } for d in syntacticRes + semanticRes])

        else:
            self.printError('Server is not Running')

    @neovim.function("TSGetErrFunc")
    def getErrFunc(self, args):
        getErrRes = self._client.getErr([self.relative_file()])
        if not getErrRes:
            pass
        else:
            filename = getErrRes['file']
            errorList = getErrRes['diagnostics']
            if len(errorList) > 0:
                errorLoc = list(map(lambda error: {
                    'type': error['category'][0].title(),
                    'filename': re.sub(self.cwd + '/', '', filename),
                    'lnum': error['start']['line'],
                    'col': error['start']['offset'],
                    'text': error['text'],
                    'length': error['end']['offset'] - error['start']['offset']
                }, errorList))

        if args is None:
            return errorLoc
        else:
            self.vim.call('neomake#process_remote_maker', errorLoc, args[0])

    @neovim.command("TSRename", nargs="*")
    def tsrename(self, args=""):
        """
        Rename the current symbol
        """
        symbol = self.vim.eval('expand("<cword>")')
        if not args:
            newName = self.vim.call(
                'input', 'nvim-ts: rename {0} to '.format(symbol))
        else:
            newName = args[0]

        if self._client.server_handle is not None:
            self.reload()
            file = self.vim.current.buffer.name
            originalLine = self.vim.current.window.cursor[0]
            offset = self.vim.current.window.cursor[1] + 2
            renameRes = self._client.renameSymbol(file, originalLine, offset)

            if (renameRes) and (renameRes['info']['canRename']):
                locs = renameRes['locs']
                changeCount = 0
                for loc in locs:
                    defFile = loc['file']
                    # self.vim.command('e ' + defFile)
                    for rename in loc['locs']:
                        line = rename['start']['line']
                        col = rename['start']['offset']
                        self.vim.command(
                            'cal cursor({}, {})'.format(line, col))
                        self.vim.command('normal cw{}'.format(newName))
                        # self.vim.command('write')
                        changeCount += 1
                # self.vim.command('e ' + file)
                self.vim.command(
                    'cal cursor({}, {})'.format(originalLine, offset))
                self.vim.out_write(
                    'Replaced {} occurences in {} files \n'.format(len(locs), changeCount))
            else:
                self.printError(renameRes['info']['localizedErrorMessage'])

    @neovim.command("TSImport")
    def tsimport(self):
        symbol = self.vim.call('expand', '<cword>')
        currentlyImportedItems, lastImportLine = utils.getCurrentImports(self._client, self.relative_file())

        if symbol in currentlyImportedItems:
            self.vim.out_write("nvim-ts: %s is already imported\n" % symbol)
            return

        results = utils.getImportCandidates(self._client, self.relative_file(), symbol)

        # No imports
        if len(results) == 0:
            self.printMsg('No import candidates were found.')
            return

        # Only one
        if len(results) == 1:
            importBlock = utils.createImportBlock(symbol, utils.getRelativeImportPath(
                self.relative_file(), results[0]), self.vim.vars["nvim_typescript#tsimport#template"])

        # More than one, need to choose
        else:
            candidates = "\n".join(["[%s]: %s" % (ix, result)
                                    for ix, result in enumerate(results)])
            input = self.vim.call(
                'input', 'nvim-ts: More than 1 candidate found, Select from the following options:\n%s\nplease choose one: ' % candidates, '',)

            self.log(int(input))
            # Input has been canceled
            if not input:
                self.printError('Import canceled')
                return

            # Input is out of range
            if int(input) > (len(results)-1):
                self.printError('Selection not valid')
                return

            # Value input is present
            else:
                importBlock = utils.createImportBlock(symbol, utils.getRelativeImportPath(
                    self.relative_file(), results[int(input)]), self.vim.vars["nvim_typescript#tsimport#template"])

        self.vim.current.buffer.append(importBlock, lastImportLine)

    # REQUEST NAVTREE/DOC SYMBOLS
    @neovim.function("TSGetDocSymbolsFunc", sync=True)
    def getDocSymbolsFunc(self, args=None):
        return self._client.getDocumentSymbols(self.relative_file())

    # Display Doc symbols in loclist
    @neovim.command("TSGetDocSymbols")
    def tsgetdocsymbols(self):
        if self._client.server_handle is not None:
            self.reload()
            docSysmbols = self._client.getDocumentSymbols(self.relative_file())
            if not docSysmbols:
                pass
            else:
                docSysmbolsLoc = []
                symbolList = docSysmbols['childItems']
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

    @neovim.function("TSGetWorkspaceSymbolsFunc", sync=True)
    def getWorkspaceSymbolsFunc(self, args=None):
        if self._client.server_handle is not None:
            self.reload()
            searchSymbols = self._client.getWorkspaceSymbols(
                self.relative_file(), args[0])
            if not searchSymbols:
                return []
            else:
                symbolList = searchSymbols
                filename = re.sub(self.cwd + '/', '', self.relative_file())
                if len(symbolList) > -1:
                    return list(map(lambda symbol: {
                                'filename': re.sub(self.cwd + '/', '', symbol['file']),
                                'lnum': symbol['start']['line'],
                                'col': symbol['start']['offset'],
                                'text': '(' + symbol['kind'] + '): ' + symbol['name']
                                }, symbolList))
        else:
            self.printError('Server is not running')

    @neovim.command("TSExtractFunction", range='')
    def extractFunction(self, range):
        # requestData = {
        #             'file': self.relative_file(),
        #             'startLine': range[0],
        #             'startOffset': self.vim.eval('col({})'.range[0]),
        #             'endLine': range[1],
        #             'endOffset':
        #         }
        # range = [2,6]
        pass

    @neovim.command("TSSig")
    def tssig(self):
        """
        Get the type info
        """
        if self._client.server_handle is not None:
            self.reload()
            file = self.vim.current.buffer.name
            line = self.vim.current.window.cursor[0]
            offset = self.vim.current.window.cursor[1] + 1
            info = self._client.getSignature(file, line, offset)
            if info:
                signatureHelpItems = list(map(lambda item: {
                    'variableArguments': item['isVariadic'],
                    'prefix': utils.convertToDisplayString(item['prefixDisplayParts']),
                    'suffix': utils.convertToDisplayString(item['suffixDisplayParts']),
                    'separator': utils.convertToDisplayString(item['separatorDisplayParts']),
                    'parameters': list(map(lambda p: {
                        'text': utils.convertToDisplayString(p['displayParts']),
                        'documentation': utils.convertToDisplayString(p['documentation']),
                    }, item['parameters']))
                }, info['items']))
                params = utils.getParams(signatureHelpItems[0][
                                         'parameters'], signatureHelpItems[0]['separator'])
                self.printHighlight(params)
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

            if refs:
                truncateAfter = self.vim.eval(
                    'g:nvim_typescript#loc_list_item_truncate_after')
                location_list = []
                refList = refs["refs"]
                if len(refList) > -1:
                    for ref in refList:
                        lineText = re.sub('^\s+', '', ref['lineText'])
                        if (truncateAfter == -1) or (len(lineText) <= truncateAfter):
                            lineText
                        else:
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

    @neovim.command("TSEditConfig")
    def tseditconfig(self):
        if self._client.server_handle is not None:
            self.reload()
            file = self.vim.current.buffer.name
            projectInfo = self._client.projectInfo(file)
            if projectInfo:
                if os.path.isfile(projectInfo['configFileName']):
                    self.vim.command('e {}'.format(
                        projectInfo['configFileName']))
                else:
                    self.printError(
                        'Can\'t edit config, in an inferred project')
        else:
            self.printError('Server is not running')

    @neovim.function('TSComplete', sync=True)
    def tsomnifunc(self, args):

        line = self.vim.eval("line('.')")
        col = self.vim.eval("col('.')")

        if args[0]:
            line_str = self.vim.current.line
            m = re.search(r"\w*$", line_str)
            return m.start() if m else -1

        else:

            prefix = args[1]
            file = self.relative_file()

            if self._client.server_handle is not None:

                if time() - self._last_input_reload > RELOAD_INTERVAL or re.search(r"\w*\.", args[1]):
                    self._last_input_reload = time()
                    self.reload()

                data = self._client.completions(file, line, col, prefix)
                self.log(data)
                if len(data) == 0:
                    return []

                if len(data) > self.vim.vars["nvim_typescript#max_completion_detail"]:
                    filtered = []
                    for entry in data:
                        if entry["kind"] != "warning":
                            filtered.append(entry)
                        return [utils.convert_completion_data(e, self.vim) for e in filtered]

                names = []
                for entry in data:
                    if (entry["kind"] != "warning"):
                        names.append(entry["name"])

                detailed_data = self._client.completion_entry_details(
                    file, line, col, names)

                if len(detailed_data) == 0:
                    return []

                return [utils.convert_detailed_completion_data(e, self.vim, isDeoplete=False) for e in detailed_data]

    @neovim.function('TSGetServerPath', sync=True)
    def tstest(self, args):
        """
        Get the path of the tsserver
        """
        return self._client.serverPath

    @neovim.function('TSOnBufEnter')
    def on_bufenter(self, args=None):
        """
       Send open event when a ts file is open
        """
        if self._client.server_handle is None:
            self.tsstart()
        else:
            self._client.open(self.relative_file())

    @neovim.function('TSOnBufSave')
    def on_bufwritepost(self, args=None):
        """
       On save, reload to detect changes
        """
        self.reload()

    @neovim.function('TSCmRefresh', sync=False)
    def on_cm_refresh(self, args):
        info = args[0]
        ctx = args[1]

        lnum = ctx['lnum']
        col = ctx['col']
        base = ctx['base']
        startcol = ctx['startcol']

        # recheck
        if self.vim.call('cm#context_changed', ctx):
            return

        max_detail = self.vim.vars["nvim_typescript#max_completion_detail"]

        self.reload()

        data = self._client.completions(
            file=self.relative_file(),
            line=lnum,
            offset=col,
            prefix=base
        )

        if len(data) == 0:
            return []

        matches = []
        if len(data) > max_detail:
            filtered = []
            for entry in data:
                if entry["kind"] != "warning":
                    filtered.append(entry)
            matches = [
                    utils.convert_completion_data(e, self.vim)
                    for e in filtered]
            self.vim.call('cm#complete', info, ctx, startcol, matches)
            return

        names = []
        maxNameLength = 0

        for entry in data:
            if entry["kind"] != "warning":
                names.append(entry["name"])
                maxNameLength = max(maxNameLength, len(entry["name"]))

        detailed_data = self._client.completion_entry_details(
            file=self.relative_file(),
            line=lnum,
            offset=col,
            entry_names=names
        )

        if len(detailed_data) == 0:
            return

        matches = [
                utils.convert_detailed_completion_data(e,
                                                       self.vim,
                                                       isDeoplete=True)
                for e in detailed_data]
        self.vim.call('cm#complete', info, ctx, startcol, matches)

    def printError(self, message):
        self.vim.err_write('nvim-ts: {0}\n'.format(message))

    def printHighlight(self, message):
        self.vim.command(
            'redraws! | echom "nvim-ts: " | echohl Function | echon "{}" | echohl None'.format(message))

    def printMsg(self, message):
        self.vim.command('redraws!')
        self.vim.out_write('nvim-ts: {0}\n'.format(message))

    def log(self, message):
        """
        Log message to vim echo
        """
        self.vim.out_write('{} \n'.format(message))
