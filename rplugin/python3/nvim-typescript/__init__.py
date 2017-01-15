import neovim
import sys
import os
import re
from tempfile import NamedTemporaryFile
sys.path.insert(1, os.path.dirname(__file__))
from client import Client

is_py3 = sys.version_info[0] >= 3
if is_py3:
    ELLIPSIS = "…"
    unicode = str
else:
    ELLIPSIS = u"…"


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
        self._client = Client()
        self.server = None
        self.__bufvars = self.vim.current.buffer.vars

        self.settings = ['setl modifiable', 'setl noswapfile',
                         'setl buftype=nofile', 'setl nomodifiable', 'setl nomodified']

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

    def projectRoot(self):
        if os.path.isfile(os.path.join(os.getcwd(), 'tsconfig.json')):
            return True
        else:
            return False

    @neovim.command("TSStop")
    def tsstop(self):
        """
            Stop the client
        """
        self.reload()
        self._client.stop()
        self.server = None
        self.vim.out_write('TS: Server Stopped')

    @neovim.command("TSStart")
    def tsstart(self):
        """
            Stat the client
        """
        if self.server is None:
            if self._client.start():
                self.server = True
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
                documentation = re.sub("\s+", " ", documentation)

                message = '{0}\n\n{1}'.format(info['body']['displayString'],
                                              info['body']['documentation'])
                # self.vim.command("split '__doc__'")
                # self.vim.command('resize 10')
                # self.vim.current.buffer.append(
                #     [displayString, '', documentation], 0)
                # for e in self.settings:
                #     self.vim.command(e)
                self.vim.command('echo' + repr(PythonToVimStr(message)))
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

                self.vim.command('e +' + defLine + ' ' + defFile)
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
                # self.vim.command('echo \'' + message + '\'')
                self.vim.out_write(message + '\n')
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
            offset = self.vim.current.window.cursor[1] + 2

            info = self._client.getDoc(file, line, offset)
            if (not info) or (not info['success']):
                pass
            else:
                message = '{0}'.format(info['body']['displayString'])
                message = re.sub("\s+", " ", message)
                self.vim.command(
                    'redraws! | echo "nvim-ts: " | echohl Function | echon \"' +
                    message + '\" | echohl None'
                )
                # self.vim.command('redraws!')
                # self.vim.out_write(message + '\n')
        else:
            self.vim.command(
                'echohl WarningMsg | echo "TS: Server is not Running" | echohl None')

    # Various Auto Commands

    @neovim.autocmd('BufEnter', pattern='*.ts,*.tsx')
    def on_bufenter(self):
        """
           Send open event when a ts file is open

        """
        if self.server is None:
            if self.projectRoot():
                self._client.start()
                self.server = True
                self.vim.out_write('TS: Server Started \n')
                self._client.open(self.relative_file())
            else:
                self.vim.out_write('TS: Cannot start server \n')
        else:
            self._client.open(self.relative_file())

    @neovim.autocmd('BufWritePost', pattern='*.ts,*.tsx')
    def on_bufwritepost(self):
        """
           On save, reload to detect changes
        """
        self.reload()
