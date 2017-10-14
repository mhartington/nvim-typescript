import os
import sys
from subprocess import check_output, CalledProcessError
import logging
from globster import Globster
log = logging.getLogger("nvim-dir")


class Dir(object):

    def __init__(self):
        excludes = ['.git/', '.hg/', '.svn/', 'node_modules']
        self.directory = os.path.basename(self.getRootPath())
        self.path = os.path.abspath(self.getRootPath())
        self.parent = os.path.dirname(self.path)
        self.exclude_file = self.load_ignore()
        self.patterns = excludes
        if self.exclude_file is not None:
            self.patterns.extend(self.load_patterns(self.exclude_file))
        self.globster = Globster(self.patterns)

    def getRootPath(self):
        try:
            return check_output(["git", "rev-parse", "--show-toplevel"]).decode().strip('\n')
        except CalledProcessError:
            return '.'

    def load_ignore(self):
        if os.path.isfile(os.path.join(self.path, '.gitignore')):
            return os.path.join(self.path, '.gitignore')
        else:
            return None

    def load_patterns(self, exclude_file):
        res = []
        ignore = filter(None, open(exclude_file).read().split("\n"))
        for val in ignore:
            if val.startswith('#'):
                pass
            else:
                res.append(val)
        return res

    def iterfiles(self):
        for root, dirs, files in self.walk():
            for f in files:
                yield self.relpath(os.path.join(root, f))

    def files(self):
        return sorted(self.iterfiles())

    def is_excluded(self, path):
        match = self.globster.match(self.relpath(path))
        if (match):
            return True
        return False

    def walk(self):
        for root, dirs, files in os.walk(self.path, topdown=True):
            ndirs = []
            # First we exclude directories
            for d in list(dirs):
                if self.is_excluded(os.path.join(root, d)):
                    dirs.remove(d)
                elif not os.path.islink(os.path.join(root, d) + '/'):
                    ndirs.append(d)

            nfiles = []
            for fpath in (os.path.join(root, f) for f in files):
                if not self.is_excluded(fpath):
                    nfiles.append(os.path.relpath(fpath, root))
            yield root, ndirs, nfiles

    def relpath(self, path):
        return os.path.relpath(path, start=self.path)
