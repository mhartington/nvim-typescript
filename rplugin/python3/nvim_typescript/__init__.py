import sys
import os
import re
import json
import neovim
from time import time
from tempfile import NamedTemporaryFile
from functools import wraps
sys.path.insert(1, os.path.dirname(__file__))
from client import Client
import utils
RELOAD_INTERVAL = 1

"""
Decorator to check if version of typescript supports feature
"""


def ts_version_support(version):
    def decorator(f):
        @wraps(f)
        def decorated_function(*args):
            ref = args[0]
            if ref._client.isCurrentVersionHigher(version):
                return f(*args)
            ref.printError(
                'Not supported in this version of TypeScript, please update')
        return decorated_function
    return decorator

"""
Decorator to check if server is running
"""


def ts_check_server(f):
    @wraps(f)
    def decorated_function(*args):
        ref = args[0]
        if ref._client.server_handle is None:
            ref.printError('Server is not running')
            return
        return f(*args)
    return decorated_function


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

    @neovim.command("TSStart")
    def tsstart(self):
        """
        Stat the client
        """
        if self._client.server_handle is None:
            should_debug = self.vim.vars["nvim_typescript#debug_enabled"]
            debug_options = self.vim.vars["nvim_typescript#debug_settings"]
            self._client.serverPath = self.vim.vars["nvim_typescript#server_path"]
            if self._client.start(should_debug, debug_options):
                self._client.setTsConfig()
                self._client.open(self.relative_file())
                self.printMsg('Server Started')

    @neovim.command("TSStop")
    def tsstop(self):
        """
        Stop the client
        """
        if self._client.server_handle is not None:
            self._client.stop()
            self.printMsg('Server Stopped')

    @neovim.command("TSRestart")
    def tsrestart(self):
        """
        Restart the Client
        """
        self.tsstop()
        self.tsstart()

    @neovim.command("TSReloadProject")
    def reloadProject(self):
        """
        Reload the server/project
        When tsconfig has changed or a new module is added from npm
        """
        self._client.refresh()

    @neovim.command("TSDoc")
    @ts_check_server
    def tsdoc(self):
        """
        Get the doc strings and type info
        """
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

    @neovim.command("TSDef")
    @ts_check_server
    def tsdef(self):
        """
        Get the definition
        """
        self.reload()
        file = self.vim.current.buffer.name
        line = self.vim.current.window.cursor[0]
        offset = self.vim.current.window.cursor[1] + 2
        info = self._client.goToDefinition(file, line, offset)
        if info:
            defFile = info[0]['file']
            defLine = '{0}'.format(info[0]['start']['line'])
            self.vim.command('e +{0} {1}'.format(defLine, defFile))
            self.addToQuickfixList(info)
        else:
            self.printError('No definition')

    @neovim.command("TSDefPreview")
    @ts_check_server
    def tsdefpreview(self):
        """
            Get the definition
        """
        self.reload()
        file = self.vim.current.buffer.name
        line = self.vim.current.window.cursor[0]
        offset = self.vim.current.window.cursor[1] + 2
        info = self._client.goToDefinition(file, line, offset)
        if info:
            defFile = info[0]['file']
            defLine = '{0}'.format(info[0]['start']['line'])
            self.vim.command('split! +{0} {1}'.format(defLine, defFile))
        else:
            self.printError('No definition')

    @neovim.command("TSType")
    @ts_check_server
    def tstype(self):
        """
        Get the type info
        """
        self.reload()
        file = self.vim.current.buffer.name
        line = self.vim.current.window.cursor[0]
        offset = self.vim.current.window.cursor[1] + 2
        info = self._client.getDoc(file, line, offset)
        if info:
            message = '{0}'.format(info['displayString'])
            message = re.sub("\s+", " ", message)
            message = message.strip(' \t\n\r')
            self.printMsg(message)

    @neovim.command("TSTypeDef")
    @ts_check_server
    def tstypedef(self):
        self.reload()
        file = self.vim.current.buffer.name
        line = self.vim.current.window.cursor[0]
        offset = self.vim.current.window.cursor[1] + 2
        typeDefRes = self._client.getTypeDefinition(file, line, offset)

        if typeDefRes:
            defFile = typeDefRes[0]['file']
            defLine = '{0}'.format(typeDefRes[0]['start']['line'])
            self.vim.command('e +' + defLine + ' ' + defFile)

    # TODO: What to do about these?
    # @neovim.command("TSGetErr")
    # @ts_check_server
    # def tsgeterr(self):
    #     """
    #     Get the type info
    #     """
    #     self.reload()
    #     files = [self.relative_file()]
    #     getErrRes = self._client.getErr(files)
    #     if not getErrRes:
    #         pass
    #     else:
    #         filename = getErrRes['file']
    #
    #         self.reportErrors([{
    #             'filename': re.sub(self.cwd + '/', '', filename),
    #             'lnum': e['start']['line'],
    #             'col': e['start']['offset'],
    #             'end': e['end'],
    #             'text': e['text']
    #         } for e in getErrRes['diagnostics']])
    #
    @neovim.command("TSSyncErr")
    @ts_check_server
    def tssyncerr(self, args=None):
        """
            Use syntacticDiagnosticsSync and semanticDiagnosticsSync to quickly load errors for the
            current file.
        """
        self.reload()
        f = self.relative_file()
        syntacticRes = self._client.syntacticDiagnosticsSync(f)
        semanticRes = self._client.semanticDiagnosticsSync(f)
        if syntacticRes is None or semanticRes is None:
            pass
        else:
            self.reportErrors([{
                'text': d['text'],
                'lnum': d['start']['line'],
                'col': d['start']['offset'],
                'end': d['end'],
                'filename': f
            } for d in syntacticRes + semanticRes])
    #
    #
    # @neovim.function("TSGetErrFunc")
    # @ts_check_server
    # def getErrFunc(self, args):
    #     getErrRes = self._client.getErr([self.relative_file()])
    #     if not getErrRes:
    #         pass
    #     else:
    #         filename = getErrRes['file']
    #         errorList = getErrRes['diagnostics']
    #         if len(errorList) > 0:
    #             errorLoc = list(map(lambda error: {
    #                 'type': error['category'][0].title(),
    #                 'filename': re.sub(self.cwd + '/', '', filename),
    #                 'lnum': error['start']['line'],
    #                 'col': error['start']['offset'],
    #                 'text': error['text'],
    #                 'length': error['end']['offset'] - error['start']['offset']
    #             }, errorList))
    #
    #     if args is None:
    #         return errorLoc
    #     else:
    #         self.vim.call('neomake#process_remote_maker', errorLoc, args[0])
    #
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
                    src_id = self.highlight_source
                )

    @neovim.command("TSRename", nargs="*")
    @ts_check_server
    def tsrename(self, args):
        """
        Rename the current symbol
        """
        self.reload()
        symbol = self.vim.eval('expand("<cword>")')
        if not args:
            newName = self.vim.call('input', 'nvim-ts: rename {0} to '.format(symbol))
        else:
            newName = args[0]
        file = self.vim.current.buffer.name
        originalLine = self.vim.current.window.cursor[0]
        offset = self.vim.current.window.cursor[1] + 1

        renameRes = self._client.renameSymbol(file, originalLine, offset)

        if (renameRes) and (renameRes['info']['canRename']):
            locs = renameRes['locs']
            changeCount = 0
            for loc in locs:
                defFile = loc['file']
                for rename in loc['locs']:
                    line = rename['start']['line']
                    col = rename['start']['offset']
                    self.vim.command(
                        'cal cursor({}, {})'.format(line, col))
                    self.vim.command('normal cw{}'.format(newName))
                    changeCount += 1
            self.vim.command(
                'cal cursor({}, {})'.format(originalLine, offset))
            self.vim.out_write(
                'Replaced {} occurences in {} files \n'.format(len(locs), changeCount))
        else:
            self.printError(renameRes['info']['localizedErrorMessage'])

    @neovim.command("TSImport")
    @ts_check_server
    @ts_version_support(216)
    def tsimport(self):
        self.reload()
        symbol = self.vim.call('expand', '<cword>')
        cursor = self.vim.current.window.cursor
        cursorPosition = {"line": cursor[0], "col": cursor[1] + 1}

        currentlyImportedItems = utils.getCurrentImports(
            self._client, self.relative_file())

        if symbol in currentlyImportedItems:
            self.printMsg("%s is already imported\n" % symbol)
            return

        results = utils.getImportCandidates(
            self._client, self.relative_file(), cursorPosition)

        # No imports
        if len(results) == 0:
            self.printMsg('No import candidates were found.')
            return

        # Only one
        if len(results) == 1:
            fixes = list(map(lambda changes: changes[
                         "textChanges"], results[0]["changes"]))

        # More than one, need to choose
        else:
            changeDescriptions = map(lambda x: x["description"], results)
            candidates = "\n".join(["[%s]: %s" % (ix, change)
                                    for ix, change in enumerate(changeDescriptions)])
            input = self.vim.call(
                'input', 'nvim-ts: More than 1 candidate found, Select from the following options:\n%s\nplease choose one: ' % candidates, '',)

            # Input has been canceled
            if not input:
                self.printError('Import canceled')
                return

            # Input is out of range
            if int(input) > (len(results) - 1):
                self.printError('Selection not valid')
                return

            # Value input is present
            else:
                fixes = list(map(lambda changes: changes[
                             "textChanges"], results[int(input)]["changes"]))

        # apply fixes
        self.applyImportChanges(fixes)

    def applyImportChanges(self, fixes):
        for textChanges in fixes:
            for change in textChanges:
                changeLine = change['start']['line'] - 1
                changeOffset = change['start']['offset']
                leadingNewLineRegex = r'^\n'
                addingNewLine = re.match(leadingNewLineRegex, change[
                                         'newText']) is not None

                leadingAndTrailingNewLineRegex = r'^\n|\n$'
                addingNewLine= re.match(leadingNewLineRegex, change[
                                        'newText']) is not None
                newText = re.sub(leadingAndTrailingNewLineRegex,
                                 '', change['newText'])
                if changeOffset == 1:
                    self.vim.current.buffer.append(newText, changeLine)
                elif addingNewLine:
                    self.vim.current.buffer.append(newText, changeLine + 1)
                else:
                    addingTrailingComma = re.match(
                        r'^,$', newText) is not None
                    lineToChange = self.vim.current.buffer[changeLine]
                    lineAlreadyHasTrailingComma = re.match(
                        r'^.*,\s*$', lineToChange) is not None

                    # we have to do this check because TSServer doesn't take into account if we already
                    # have a trailing comma before suggesting one
                    if addingTrailingComma and lineAlreadyHasTrailingComma:
                        pass
                    else:
                        modifiedLine = lineToChange[
                            :changeOffset - 1] + newText + lineToChange[changeOffset - 1:]
                        self.vim.current.buffer[changeLine] = modifiedLine

    # REQUEST NAVTREE/DOC SYMBOLS
    @neovim.function("TSGetDocSymbolsFunc", sync=True)
    @ts_check_server
    def getDocSymbolsFunc(self, args=None):
        return self._client.getDocumentSymbols(self.relative_file())

    # Display Doc symbols in loclist
    @neovim.command("TSGetDocSymbols")
    @ts_check_server
    def tsgetdocsymbols(self):
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

    @neovim.function("TSGetWorkspaceSymbolsFunc", sync=True)
    @ts_check_server
    def getWorkspaceSymbolsFunc(self, args=None):
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

    @neovim.command("TSExtractFunction", range='')
    def extractFunction(self, range):
        refactorAction = self.getApplicableRefactors(range)
        self.log(refactorAction)

    def getApplicableRefactors(self, range):
        requestData = {
            'file': self.relative_file(),
            'startLine': range[0],
            'startOffset': self.vim.eval('col("{}")'.format("'<")),
            'endLine': range[1],
            'endOffset': self.vim.eval('col("{}")'.format("'>"))
        }
        refactors = self._client.getApplicableRefactors(requestData)
        availableRefactors = refactors[0]['actions']
        candidates = "\n".join(["[%s]: %s" % (ix, change['description'])
                                for ix, change in enumerate(availableRefactors)])
        refactorChoice = self.vim.call(
            'input', 'nvim-ts: Select from the following options:\n%s\nplease choose one: ' % candidates, '',)

        return availableRefactors[int(refactorChoice)]

    @neovim.command("TSSig")
    @ts_check_server
    def tssig(self):
        """
        Get type signature for symbol at cursor
        """
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

    @neovim.command("TSRefs")
    @ts_check_server
    def tsrefs(self):
        """
        Get all references of a symbol in a file
        """
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

    # Edit your tsconfig
    @neovim.command("TSEditConfig")
    @ts_check_server
    def tseditconfig(self):
        """
        Open and edit the root tsconfig file
        """
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

    # Omnifunc for regular neovim
    @neovim.function('TSComplete', sync=True)
    def tsomnifunc(self, args):
        """
        Omni func for completion
        """

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

    # Server utils, Status, version, path
    @neovim.function('TSGetServerPath', sync=True)
    def ts_get_server_path(self, args):
        """
        Get the path of the tsserver
        """
        return self._client.serverPath

    @neovim.function('TSGetVersion', sync=True)
    def ts_get_version(self, args):
        """
        get the ts version
        """
        return self._client.tsConfig

    @neovim.function('TSGetServerStatus', sync=True)
    def ts_server_status(self, args):
        """
        get the ts version
        """
        return self._client.status()

    # Buffer events
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
        """
        For ncm
        """
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

    """
    Internal Utils
    """

    def printError(self, message):
        self.vim.err_write('nvim-ts: {0}\n'.format(message))

    def printHighlight(self, message):
        self.vim.command(
            'redraws! | echom "nvim-ts: " | echohl Function | echon "{0}" | echohl None'.format(message))

    def printMsg(self, message):
        # winWidth = self.vim.current.window.width
        # self.log(winWidth)
        # self.log(len(message))
        # x = self.vim.eval('&ruler')
        # y = self.vim.eval('&showcmd')
        # self.vim.command('set noruler noshowcmd')
        #
        # self.vim.command('redraws!')

        # formatted = message[:winWidth]
        self.vim.out_write('nvim-ts: {0}\n'.format(message))

    def log(self, message):
        """
        Log message to vim echo
        """
        self.vim.out_write('{} \n'.format(message))

    def addToQuickfixList(self, info):
        qflist = []
        for item in info:
            qflist.append({
                'col': item['start']['offset'],
                'lnum': item['start']['line'],
                'filename': item['file'],
            })
        self.vim.funcs.setqflist(qflist, 'r')
        if len(qflist) > 1:
            self.vim.command('cwindow')
