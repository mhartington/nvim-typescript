#! /usr/bin/env python3

import os
import re
import sys
from functools import wraps
from tempfile import NamedTemporaryFile
from time import time

import neovim
from .utils import *
sys.path.insert(1, os.path.dirname(__file__))
import client

RELOAD_INTERVAL = 1

"""
Decorator to check if version of typescript supports feature
"""


def ts_version_support(version):
    def decorator(f):
        @wraps(f)
        def decorated_function(*args):
            ref = args[0]
            if client.isCurrentVersionHigher(version):
                return f(*args)
            ref.printError(
                'Not supported in this version of TypeScript, please update')
        return decorated_function
    return decorator


"""
Decorator to check if server is running
"""


def ts_check_server(silent=False):
    def decorator(f):
        @wraps(f)
        def decorated_function(*args):
            ref = args[0]
            if client.server_handle is None:
                if silent is not True:
                    ref.printError('Server is not running')
                return
            return f(*args)
        return decorated_function
    return decorator


@neovim.plugin
class TypescriptHost(object):

    def __init__(self, vim):
        self.vim = vim
        self._last_input_reload = time()
        self.highlight_source = 0
        client.logFunc = self.log

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

    @neovim.function('TSRefresh')
    def reload(self, args=None):
        """
        Call tsserver.reload()
        """
        filename = self.relative_file()
        contents = self.vim.eval("join(getline(1,'$'), \"\n\")")
        tmpfile = NamedTemporaryFile(delete=False)
        tmpfile.write(contents.encode("utf-8"))
        tmpfile.close()

        try:
            client.reload(filename, tmpfile.name)
        except:
            pass
        os.unlink(tmpfile.name)

    @neovim.command("TSStart")
    def tsstart(self):
        """
        Stat the client
        """
        if client.server_handle is None:
            should_debug = self.vim.vars["nvim_typescript#debug_enabled"]
            debug_options = self.vim.vars["nvim_typescript#debug_settings"]
            client.setServerPath(
                self.vim.vars["nvim_typescript#server_path"])
            if client.start(should_debug, debug_options):
                client.setTsConfigVersion()
                client.open(self.relative_file())
                self.printMsg('Server Started')

    @neovim.command("TSStop")
    def tsstop(self):
        """
        Stop the client
        """
        if client.server_handle is not None:
            client.stop()
            self.printMsg('Server Stopped')

    @neovim.command("TSRestart")
    def tsrestart(self):
        """
        Restart the Client
        """
        self.tsstop()
        self.tsstart()

    @neovim.command("TSReloadProject")
    @ts_check_server(silent=True)
    def reloadProject(self):
        """
        Reload the server/project
        When tsconfig has changed or a new module is added from npm
        """
        client.refresh()

    @neovim.command("TSDoc")
    @ts_check_server()
    def tsdoc(self):
        """
        Get the doc strings and type info
        """
        self.reload()
        file = self.vim.current.buffer.name
        line = self.vim.current.window.cursor[0]
        offset = self.vim.current.window.cursor[1] + 1
        info = client.getDoc(file, line, offset)

        if info:
            displayString = '{0}'.format(info['displayString'])
            documentation = '{0}'.format(info['documentation'])
            documentation = documentation.split('\n')
            displayString = displayString.split('\n')
            message = displayString + documentation
            buf = self.vim.eval("bufnr('__doc__')")
            self.log(buf)
            if buf > 0:
                wi = self.vim.eval(
                    "index(tabpagebuflist(tabpagenr())," + str(buf) + ")")
                self.log(wi)
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
    @ts_check_server()
    def tsdef(self):
        """
        Get the definition
        """
        self.reload()
        file = self.vim.current.buffer.name
        line = self.vim.current.window.cursor[0]
        offset = self.vim.current.window.cursor[1] + 1
        info = client.goToDefinition(file, line, offset)
        if info:
            defFile = info[0]['file']
            defLine = '{0}'.format(info[0]['start']['line'])
            self.vim.command('e +{0} {1}'.format(defLine, defFile))
            self.addToQuickfixList(info)
        else:
            self.printError('No definition')

    @neovim.command("TSDefPreview")
    @ts_check_server()
    def tsdefpreview(self):
        """
            Get the definition
        """
        self.reload()
        file = self.vim.current.buffer.name
        line = self.vim.current.window.cursor[0]
        offset = self.vim.current.window.cursor[1] + 1
        info = client.goToDefinition(file, line, offset)
        if info:
            defFile = info[0]['file']
            defLine = '{0}'.format(info[0]['start']['line'])
            self.vim.command('split! +{0} {1}'.format(defLine, defFile))
        else:
            self.printError('No definition')

    @neovim.command("TSType")
    @ts_check_server()
    def tstype(self):
        """
        Get the type info
        """
        self.reload()
        file = self.vim.current.buffer.name
        line = self.vim.current.window.cursor[0]
        offset = self.vim.current.window.cursor[1] + 1
        info = client.getDoc(file, line, offset)
        if info:
            message = '{0}'.format(info['displayString'])
            message = re.sub("\s+", " ", message)
            message = message.strip(' \t\n\r')
            self.printMsg(message)

    @neovim.command("TSTypeDef")
    @ts_check_server()
    def tstypedef(self):
        self.reload()
        file = self.vim.current.buffer.name
        line = self.vim.current.window.cursor[0]
        offset = self.vim.current.window.cursor[1] + 1
        typeDefRes = client.getTypeDefinition(file, line, offset)

        if typeDefRes:
            defFile = typeDefRes[0]['file']
            defLine = '{0}'.format(typeDefRes[0]['start']['line'])
            self.vim.command('e +' + defLine + ' ' + defFile)

    @neovim.command('TSSortImports')
    @ts_check_server()
    @ts_version_support(280)
    def sortImports(self):
        file = self.vim.current.buffer.name
        args = {
            "scope": {
                "type": "file",
                "args": {
                    "file": file
                }
            }
        }
        sortImportsReq = client.execute('organizeImports', args)
        self.applyImportOrganize(sortImportsReq[0]['textChanges'])

    def applyImportOrganize(self, fixes):
        delete_range = [fixes[0]['start']['line'], fixes[-1]['start']['line']]
        self.vim.funcs.cursor(delete_range[0])
        self.vim.command('normal d{}G'.format(delete_range[-1]))
        formatted = list(filter(None, fixes[0]['newText'].split("\n")))
        self.vim.current.buffer.append(formatted, 0)



    @neovim.command("TSRename", nargs="*")
    @ts_check_server()
    def tsrename(self, args):
        """
        Rename the current symbol
        """
        symbol = self.vim.eval('expand("<cword>")')
        if not args:
            newName = self.vim.funcs.input(
                'nvim-ts: rename {0} to '.format(symbol))
        else:
            newName = args[0]
        file = self.vim.current.buffer.name
        originalLine = self.vim.current.window.cursor[0]
        offset = self.vim.current.window.cursor[1] + 1
        self.reload()

        renameRes = client.renameSymbol(file, originalLine, offset)
        if (renameRes) and (renameRes['info']['canRename']):
            locs = renameRes['locs']
            changeCount = 0
            for loc in locs:
                defFile = loc['file']
                for rename in loc['locs']:
                    line = rename['start']['line']
                    col = rename['start']['offset']
                    self.vim.funcs.cursor(line, col)
                    self.vim.command('normal cw{}'.format(newName))
                    changeCount += 1
            self.vim.funcs.cursor(originalLine, offset)
            self.vim.out_write(
                'Replaced {} occurences in {} files \n'.format(changeCount, len(locs)))
        else:
            self.printError(renameRes['info']['localizedErrorMessage'])

    @neovim.command("TSImport")
    @ts_check_server()
    @ts_version_support(216)
    def tsimport(self):
        self.reload()
        symbol = self.vim.call('expand', '<cword>')
        cursor = self.vim.current.window.cursor
        cursorPosition = {"line": cursor[0], "col": cursor[1] + 1}

        currentlyImportedItems = getCurrentImports(
            client, self.relative_file())

        if symbol in currentlyImportedItems:
            self.printMsg("%s is already imported\n" % symbol)
            return

        results = getImportCandidates(
            client, self.relative_file(), cursorPosition)

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
                addingNewLine = re.match(leadingNewLineRegex, change[
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

    # Display Doc symbols in loclist
    @neovim.command("TSGetDocSymbols")
    @ts_check_server()
    def tsgetdocsymbols(self):
        self.reload()
        docSysmbols = client.getDocumentSymbols(self.relative_file())
        if not docSysmbols:
            pass
        else:
            docSysmbolsLoc = []
            symbolList = docSysmbols['childItems']
            filename = self.relative_file()
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
    @ts_check_server()
    def getWorkspaceSymbolsFunc(self, args=None):
        self.reload()
        searchSymbols = client.getWorkspaceSymbols(
            self.relative_file(), args[0])
        if not searchSymbols:
            return []
        else:
            symbolList = searchSymbols
            filename = self.relative_file()
            if len(symbolList) > -1:
                return list(map(lambda symbol: {
                            'filename': symbol['file'],
                            'lnum': symbol['start']['line'],
                            'col': symbol['start']['offset'],
                            'text': '(' + symbol['kind'] + '): ' + symbol['name']
                            }, symbolList))

    @neovim.command("TSExtractFunction", range='')
    @ts_check_server()
    def extractFunction(self, range):
        self.reload()
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

        refactors = client.getApplicableRefactors(requestData)
        availableRefactors = refactors[0]['actions']
        candidates = "\n".join(["[%s]: %s" % (ix, change['description'])
                                for ix, change in enumerate(availableRefactors)])
        refactorChoice = self.vim.call(
            'input', 'nvim-ts: Select from the following options:\n%s\nplease choose one: ' % candidates, '',)

        return availableRefactors[int(refactorChoice)]

    @neovim.command("TSSig")
    @ts_check_server()
    def tssig(self):
        """
        Get type signature for symbol at cursor
        """
        self.reload()
        file = self.vim.current.buffer.name
        line = self.vim.current.window.cursor[0]
        offset = self.vim.current.window.cursor[1]
        info = client.getSignature(file, line, offset)
        if info:
            signatureHelpItems = list(map(lambda item: {
                'variableArguments': item['isVariadic'],
                'prefix': convertToDisplayString(item['prefixDisplayParts']),
                'suffix': convertToDisplayString(item['suffixDisplayParts']),
                'separator': convertToDisplayString(item['separatorDisplayParts']),
                'parameters': list(map(lambda p: {
                    'text': convertToDisplayString(p['displayParts']),
                    'documentation': convertToDisplayString(p['documentation']),
                }, item['parameters']))
            }, info['items']))
            params = getParams(signatureHelpItems[0][
                'parameters'], signatureHelpItems[0]['separator'])
            self.printHighlight(params)

    @neovim.command("TSRefs")
    @ts_check_server()
    def tsrefs(self):
        """
        Get all references of a symbol in a file
        """
        self.reload()
        file = self.vim.current.buffer.name
        line = self.vim.current.window.cursor[0]
        offset = self.vim.current.window.cursor[1] + 1
        refs = client.getRef(file, line, offset)
        if refs:
            truncateAfter = self.vim.eval(
                'g:nvim_typescript#loc_list_item_truncate_after')
            location_list = []
            refList = refs["refs"]
            if len(refList) > 0:
                for ref in refList:
                    lineText = re.sub('^\s+', '', ref['lineText'])
                    if (truncateAfter == -1) or (len(lineText) <= truncateAfter):
                        lineText
                    else:
                        lineText = (lineText[:truncateAfter] + '...')
                    location_list.append({
                        'filename': ref['file'],
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
    @ts_check_server()
    def tseditconfig(self):
        """
        Open and edit the root tsconfig file
        """
        self.reload()
        file = self.vim.current.buffer.name
        projectInfo = client.projectInfo(file)
        if projectInfo:
            if os.path.isfile(projectInfo['configFileName']):
                self.vim.command('e {}'.format(
                    projectInfo['configFileName']))
            else:
                self.printError(
                    'Can\'t edit config, in an inferred project')

    # Omnifunc for regular neovim
    @neovim.function('TSOmnicFunc', sync=True)
    def tsomnifunc(self, args):
        self.log(args)
        if args[0]:
            return self.tsfindstart()
        else:
            return self.tscomplete(args[1])

    @neovim.function('TSComplete', sync=True)
    @ts_check_server(silent=True)
    def tscomplete(self, args):
        line = self.vim.current.window.cursor[0]
        col = self.vim.current.window.cursor[1] + 1
        file = self.relative_file()
        if len(args) > 1:
            prefix = args[0]
            col = args[1][0]
        else:
            prefix = args
        self.reload()

        data = client.completions(file, line, col, prefix)
        if len(data) == 0:
            return []

        if len(data) > self.vim.vars["nvim_typescript#max_completion_detail"]:
            filtered = []
            for entry in data:
                if entry["kind"] != "warning":
                    filtered.append(entry)
            # self.vim.funcs.complete(col, [convert_completion_data(e, self.vim) for e in filtered])
            return [convert_completion_data(e, self.vim) for e in filtered]
        names = []
        for entry in data:
            if (entry["kind"] != "warning"):
                names.append(entry["name"])
        detailed_data = client.completion_entry_details(
            file, line, col, names)
        if len(detailed_data) == 0:
            return []
        # self.vim.funcs.complete(col, [convert_detailed_completion_data(e, self.vim) for e in detailed_data])
        return [convert_detailed_completion_data(e, self.vim) for e in detailed_data]

    @neovim.function('TSFindStart', sync=True)
    def tsfindstart(self):
        line_str = self.vim.current.line
        m = re.search(r"\w*$", line_str)
        # self.log(m.start() if m else -1)
        return m.start() if m else -1

    # Server utils, Status, version, path
    @neovim.function('TSGetServerPath', sync=True)
    def ts_get_server_path(self, args):
        """
        Get the path of the tsserver
        """
        return client.serverPath

    @neovim.function('TSGetVersion', sync=True)
    def ts_get_version(self, args):
        """
        get the ts version
        """
        return client.tsConfigVersion

    @neovim.function('TSGetServerStatus', sync=True)
    def ts_server_status(self, args):
        """
        get the ts version
        """
        return client.status()

    # Buffer events
    @neovim.function('TSOnBufEnter')
    def on_bufenter(self, args=None):
        """
       Send open event when a ts file is open
        """
        if client.server_handle is None:
            self.tsstart()
        else:
            client.open(self.relative_file())

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

        data = client.completions(
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
                convert_completion_data(e, self.vim)
                for e in filtered]
            self.vim.call('cm#complete', info, ctx, startcol, matches)
            return

        names = []
        maxNameLength = 0

        for entry in data:
            if entry["kind"] != "warning":
                names.append(entry["name"])
                maxNameLength = max(maxNameLength, len(entry["name"]))

        detailed_data = client.completion_entry_details(
            file=self.relative_file(),
            line=lnum,
            offset=col,
            entry_names=names
        )

        if len(detailed_data) == 0:
            return

        matches = [convert_detailed_completion_data(
            e, self.vim) for e in detailed_data]
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
        self.vim.out_write('nvim-ts: {0} \n'.format(message))

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
