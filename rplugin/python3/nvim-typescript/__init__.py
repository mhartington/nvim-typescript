import sys
import os
import re
import json
import neovim
from tempfile import NamedTemporaryFile
sys.path.insert(1, os.path.dirname(__file__))
from client import Client
from dir import Dir

is_py3 = sys.version_info[0] >= 3
if is_py3:
    ELLIPSIS = "…"
    unicode = str
else:
    ELLIPSIS = u"…"

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


class PythonToVimStr(unicode):
    """
        Vim has a different string implementation of single quotes
        Borrowed from vim-jedi
    """
    __slots__ = []

    def __new__(cls, obj, encoding='UTF-8'):
        if not (is_py3 or isinstance(obj, unicode)):
            obj = unicode.__new__(cls, obj, encoding)

        # Vim cannot deal with zero bytes:
        obj = obj.replace('\0', '\\0')
        return unicode.__new__(cls, obj)

    def __repr__(self):
        # this is totally stupid and makes no sense but vim/python unicode
        # support is pretty bad. don't ask how I came up with this... It just
        # works...
        # It seems to be related to that bug: http://bugs.python.org/issue5876
        if unicode is str:
            s = self
        else:
            s = self.encode('UTF-8')
        return '"%s"' % s.replace('\\', '\\\\').replace('"', r'\"')


@neovim.plugin
class TypescriptHost():

    def __init__(self, vim):
        self.vim = vim
        self._client = Client(debug_fn=self.log, log_fn=self.log)
        self.server = None
        self.files = Dir()
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

        self._client.reload(filename, tmpfile.name)

        os.unlink(tmpfile.name)

    def findconfig(self):
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
        if self.server is not None:
            self.reload()
            self._client.stop()
            self.server = None
            self.vim.command('redraws!')
            self.vim.out_write('TS: Server Stopped')

    @neovim.command("TSStart")
    def tsstart(self):
        """
            Stat the client
        """
        if self.server is None:
            if self._client.start():
                self.server = True
                self.vim.command('redraws')
                self.vim.out_write('TS: Server Started \n')

    @neovim.command("TSRestart")
    def tsrestart(self):
        """
            Restart the Client
        """
        self._client.restart()
        self._client.open(self.relative_file())

    @neovim.command("TSDoc")
    def tsdoc(self):
        """
            Get the doc strings and type info

        """
        if self.server is not None:
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
                self.vim.feedkeys('ggdG')
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
        if self.server is not None:
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

                self.vim.command('e! +' + defLine + ' ' + defFile)
        else:
            self.vim.command(
                'echohl WarningMsg | echo "TS: Server is not Running" | echohl None')

    @neovim.command("TSDefPreview")
    def tsdefpreview(self):
        """
            Get the definition
        """
        if self.server is not None:
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
        if self.server is not None:
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
        if self.server is not None:
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
                    self.vim.call('setqflist', errorLoc, 'r', 'Errors')
                    self.vim.command('cwindow')
                    # 'text': (error['text'][:20]+'...') if len(error['text']) > 20 else error['text']
        else:
            self.vim.command(
                'echohl WarningMsg | echo "TS: Server is not Running" | echohl None')

    @neovim.command("TSSig")
    def tssig(self):
        """
            Get the type info

        """
        if self.server is not None:
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
                    # pylint: disable=locally-disabled, line-too-long
                    self.vim.command(
                        'redraws! | echom "nvim-ts: " | echohl Function | echon \"' + message + '\" | echohl None')
                else:
                    pass
        else:
            self.vim.command(
                'echohl WarningMsg | echo "TS: Server is not Running" | echohl None')

    @neovim.command("TSRefs")
    def tsrefs(self):
        """
            Get the type info
        """

        if self.server is not None:
            self.reload()
            file = self.vim.current.buffer.name
            line = self.vim.current.window.cursor[0]
            offset = self.vim.current.window.cursor[1] + 2

            refs = self._client.getRef(file, line, offset)

            if (not refs) or (refs['success'] is False):
                pass
            else:
                location_list = []
                refList = refs["body"]["refs"]
                if len(refList) > -1:
                    for ref in refList:
                        location_list.append({
                            'filename': re.sub(self.cwd + '/', '', ref['file']),
                            'lnum': ref['start']['line'],
                            'col': ref['start']['offset'],
                            'text': (ref['lineText'][:20] + '...') if len(ref['lineText']) > 20 else ref['lineText']
                        })
                    self.vim.call('setloclist', 0, location_list,
                                  'r', 'References')
                    self.vim.command('lwindow')
                else:
                    self.vim.command(
                        'echohl WarningMsg | echo "nvim-ts: References not found" | echohl None')
        else:
            self.vim.command(
                'echohl WarningMsg | echo "TS: Server is not Running" | echohl None')

    @neovim.function('TSGetServerPath')
    def tstest(self, args):
        """
        Get the path of the tsserver
        """
        self.vim.out_write(self._client.getServer() + '\n')

    @neovim.function('TSOnBufEnter')
    def on_bufenter(self, args):
        """
           Send open event when a ts file is open

        """
        if self.findconfig():
            if self.server is None:
                self.tsstart()
                self._client.open(self.relative_file())
            else:
                self._client.open(self.relative_file())
        else:
            self.writeFile()

    @neovim.function('TSOnBufSave')
    def on_bufwritepost(self, args):
        """
           On save, reload to detect changes
        """
        self.reload()

    def log(self, message):
        """
        Log message to vim echo
        """
        val = "{}".format(message)
        self.vim.command('redraws!')
        self.vim.out_write(val + '\n')
