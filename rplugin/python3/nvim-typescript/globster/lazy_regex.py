# Copyright (C) 2006 Canonical Ltd
#
# This program is free software; you can redistribute it and/or modify
# it under the terms of the GNU General Public License as published by
# the Free Software Foundation; either version 2 of the License, or
# (at your option) any later version.
#
# This program is distributed in the hope that it will be useful,
# but WITHOUT ANY WARRANTY; without even the implied warranty of
# MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
# GNU General Public License for more details.
#
# You should have received a copy of the GNU General Public License
# along with this program; if not, write to the Free Software
# Foundation, Inc., 51 Franklin Street, Fifth Floor, Boston, MA 02110-1301 USA

"""Lazily compiled regex objects.

This module defines a class which creates proxy objects for regex
compilation.  This allows overriding re.compile() to return lazily compiled
objects.  

We do this rather than just providing a new interface so that it will also
be used by existing Python modules that create regexs.
"""

from __future__ import absolute_import

import re

class InvalidPattern(Exception):
    pass

class LazyRegex(object):
    """A proxy around a real regex, which won't be compiled until accessed."""


    # These are the parameters on a real _sre.SRE_Pattern object, which we
    # will map to local members so that we don't have the proxy overhead.
    _regex_attributes_to_copy = [
                 '__copy__', '__deepcopy__', 'findall', 'finditer', 'match',
                 'scanner', 'search', 'split', 'sub', 'subn'
                 ]

    # We use slots to keep the overhead low. But we need a slot entry for
    # all of the attributes we will copy
    __slots__ = ['_real_regex', '_regex_args', '_regex_kwargs',
                ] + _regex_attributes_to_copy

    def __init__(self, args=(), kwargs={}):
        """Create a new proxy object, passing in the args to pass to re.compile

        :param args: The `*args` to pass to re.compile
        :param kwargs: The `**kwargs` to pass to re.compile
        """
        self._real_regex = None
        self._regex_args = args
        self._regex_kwargs = kwargs

    def _compile_and_collapse(self):
        """Actually compile the requested regex"""
        self._real_regex = self._real_re_compile(*self._regex_args,
                                                 **self._regex_kwargs)
        for attr in self._regex_attributes_to_copy:
            setattr(self, attr, getattr(self._real_regex, attr))

    def _real_re_compile(self, *args, **kwargs):
        """Thunk over to the original re.compile"""
        try:
            return _real_re_compile(*args, **kwargs)
        except re.error as e:
            # raise InvalidPattern instead of re.error as this gives a
            # cleaner message to the user.
            raise InvalidPattern('"' + args[0] + '" ' +str(e))

    def __getstate__(self):
        """Return the state to use when pickling."""
        return {
            "args": self._regex_args,
            "kwargs": self._regex_kwargs,
            }

    def __setstate__(self, dict):
        """Restore from a pickled state."""
        self._real_regex = None
        setattr(self, "_regex_args", dict["args"])
        setattr(self, "_regex_kwargs", dict["kwargs"])

    def __getattr__(self, attr):
        """Return a member from the proxied regex object.

        If the regex hasn't been compiled yet, compile it
        """
        if self._real_regex is None:
            self._compile_and_collapse()
        # Once we have compiled, the only time we should come here
        # is actually if the attribute is missing.
        return getattr(self._real_regex, attr)


def lazy_compile(*args, **kwargs):
    """Create a proxy object which will compile the regex on demand.

    :return: a LazyRegex proxy object.
    """
    return LazyRegex(args, kwargs)


def install_lazy_compile():
    """Make lazy_compile the default compile mode for regex compilation.

    This overrides re.compile with lazy_compile. To restore the original
    functionality, call reset_compile().
    """
    re.compile = lazy_compile


def reset_compile():
    """Restore the original function to re.compile().

    It is safe to call reset_compile() multiple times, it will always
    restore re.compile() to the value that existed at import time.
    Though the first call will reset back to the original (it doesn't
    track nesting level)
    """
    re.compile = _real_re_compile


_real_re_compile = re.compile
if _real_re_compile is lazy_compile:
    raise AssertionError(
        "re.compile has already been overridden as lazy_compile, but this would" \
        " cause infinite recursion")
