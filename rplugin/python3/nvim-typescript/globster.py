# Copyright (C) 2013 Thomas Sileo
# Copyright (C) 2012 Mikko Ohtamaa
# Copyright (C) 2006-2011 Canonical Ltd

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

"""Tools for converting globs to regular expressions.

This module provides functions for converting shell-like globs to regular
expressions.
"""

from __future__ import absolute_import

import re
import logging

logger = logging.getLogger("globster")

import lazy_regex

# Dummy out some bzr internals
def mutter(x):
    logger.debug(x)

trace = mutter

class Replacer(object):
    """Do a multiple-pattern substitution.

    The patterns and substitutions are combined into one, so the result of
    one replacement is never substituted again. Add the patterns and
    replacements via the add method and then call the object. The patterns
    must not contain capturing groups.
    """

    _expand = lazy_regex.lazy_compile(r'\\&')

    def __init__(self, source=None):
        self._pat = None
        if source:
            self._pats = list(source._pats)
            self._funs = list(source._funs)
        else:
            self._pats = []
            self._funs = []

    def add(self, pat, fun):
        r"""Add a pattern and replacement.

        The pattern must not contain capturing groups.
        The replacement might be either a string template in which \& will be
        replaced with the match, or a function that will get the matching text
        as argument. It does not get match object, because capturing is
        forbidden anyway.
        """
        self._pat = None
        self._pats.append(pat)
        self._funs.append(fun)

    def add_replacer(self, replacer):
        r"""Add all patterns from another replacer.

        All patterns and replacements from replacer are appended to the ones
        already defined.
        """
        self._pat = None
        self._pats.extend(replacer._pats)
        self._funs.extend(replacer._funs)

    def __call__(self, text):
        if not self._pat:
            self._pat = lazy_regex.lazy_compile(
                    '|'.join(['(%s)' % p for p in self._pats]),
                    re.UNICODE)
        return self._pat.sub(self._do_sub, text)

    def _do_sub(self, m):
        fun = self._funs[m.lastindex - 1]
        if hasattr(fun, '__call__'):
            return fun(m.group(0))
        else:
            return self._expand.sub(m.group(0), fun)


_sub_named = Replacer()
_sub_named.add(r'\[:digit:\]', r'\d')
_sub_named.add(r'\[:space:\]', r'\s')
_sub_named.add(r'\[:alnum:\]', r'\w')
_sub_named.add(r'\[:ascii:\]', r'\0-\x7f')
_sub_named.add(r'\[:blank:\]', r' \t')
_sub_named.add(r'\[:cntrl:\]', r'\0-\x1f\x7f-\x9f')


def _sub_group(m):
    if m[1] in ('!', '^'):
        return '[^' + _sub_named(m[2:-1]) + ']'
    return '[' + _sub_named(m[1:-1]) + ']'


def _invalid_regex(repl):
    def _(m):
        warning("'%s' not allowed within a regular expression. "
                "Replacing with '%s'" % (m, repl))
        return repl
    return _


def _trailing_backslashes_regex(m):
    """Check trailing backslashes.

    Does a head count on trailing backslashes to ensure there isn't an odd
    one on the end that would escape the brackets we wrap the RE in.
    """
    if (len(m) % 2) != 0:
        warning("Regular expressions cannot end with an odd number of '\\'. "
                "Dropping the final '\\'.")
        return m[:-1]
    return m


_sub_re = Replacer()
_sub_re.add('^RE:', '')
_sub_re.add('\((?!\?)', '(?:')
_sub_re.add('\(\?P<.*>', _invalid_regex('(?:'))
_sub_re.add('\(\?P=[^)]*\)', _invalid_regex(''))
_sub_re.add(r'\\+$', _trailing_backslashes_regex)


_sub_fullpath = Replacer()
_sub_fullpath.add(r'^RE:.*', _sub_re) # RE:<anything> is a regex
_sub_fullpath.add(r'\[\^?\]?(?:[^][]|\[:[^]]+:\])+\]', _sub_group) # char group
_sub_fullpath.add(r'(?:(?<=/)|^)(?:\.?/)+', '') # canonicalize path
_sub_fullpath.add(r'\\.', r'\&') # keep anything backslashed
_sub_fullpath.add(r'[(){}|^$+.]', r'\\&') # escape specials
_sub_fullpath.add(r'(?:(?<=/)|^)\*\*+/', r'(?:.*/)?') # **/ after ^ or /
_sub_fullpath.add(r'\*+', r'[^/]*') # * elsewhere
_sub_fullpath.add(r'\?', r'[^/]') # ? everywhere


_sub_basename = Replacer()
_sub_basename.add(r'\[\^?\]?(?:[^][]|\[:[^]]+:\])+\]', _sub_group) # char group
_sub_basename.add(r'\\.', r'\&') # keep anything backslashed
_sub_basename.add(r'[(){}|^$+.]', r'\\&') # escape specials
_sub_basename.add(r'\*+', r'.*') # * everywhere
_sub_basename.add(r'\?', r'.') # ? everywhere


def _sub_extension(pattern):
    return _sub_basename(pattern[2:])


class Globster(object):
    """A simple wrapper for a set of glob patterns.

    Provides the capability to search the patterns to find a match for
    a given filename (including the full path).

    Patterns are translated to regular expressions to expidite matching.

    The regular expressions for multiple patterns are aggregated into
    a super-regex containing groups of up to 99 patterns.
    The 99 limitation is due to the grouping limit of the Python re module.
    The resulting super-regex and associated patterns are stored as a list of
    (regex,[patterns]) in _regex_patterns.

    For performance reasons the patterns are categorised as extension patterns
    (those that match against a file extension), basename patterns
    (those that match against the basename of the filename),
    and fullpath patterns (those that match against the full path).
    The translations used for extensions and basenames are relatively simpler
    and therefore faster to perform than the fullpath patterns.

    Also, the extension patterns are more likely to find a match and
    so are matched first, then the basename patterns, then the fullpath
    patterns.
    """
    # We want to _add_patterns in a specific order (as per type_list below)
    # starting with the shortest and going to the longest.
    # As some Python version don't support ordered dicts the list below is
    # used to select inputs for _add_pattern in a specific order.
    pattern_types = [ "extension", "basename", "fullpath" ]

    pattern_info = {
        "extension" : {
            "translator" : _sub_extension,
            "prefix" : r'(?:.*/)?(?!.*/)(?:.*\.)'
        },
        "basename" : {
            "translator" : _sub_basename,
            "prefix" : r'(?:.*/)?(?!.*/)'
        },
        "fullpath" : {
            "translator" : _sub_fullpath,
            "prefix" : r''
        },
    }

    def __init__(self, patterns, debug=False):
        self._regex_patterns = []
        self.debug = debug
        pattern_lists = {
            "extension" : [],
            "basename" : [],
            "fullpath" : [],
        }
        for pat in patterns:
            pat = normalize_pattern(pat)
            pattern_lists[Globster.identify(pat)].append(pat)
        pi = Globster.pattern_info
        for t in Globster.pattern_types:
            self._add_patterns(pattern_lists[t], pi[t]["translator"],
                pi[t]["prefix"])

    def _add_patterns(self, patterns, translator, prefix=''):
        while patterns:
            grouped_rules = [
                '(%s)' % translator(pat) for pat in patterns[:99]]
            joined_rule = '%s(?:%s)$' % (prefix, '|'.join(grouped_rules))
            # Explicitly use lazy_compile here, because we count on its
            # nicer error reporting.
            self._regex_patterns.append((
                lazy_regex.lazy_compile(joined_rule, re.UNICODE),
                patterns[:99]))
            patterns = patterns[99:]

    def match(self, filename):
        """Searches for a pattern that matches the given filename.

        :return A matching pattern or None if there is no matching pattern.
        """

        try:
            for regex, patterns in self._regex_patterns:
                match = regex.match(filename)

                debug_template = "%s against %s: %%s" % (filename, regex._real_regex.pattern)

                if match:
                    if self.debug:
                        logger.info(debug_template % "hit")
                    return patterns[match.lastindex -1]

                if self.debug:
                    logger.info(debug_template % "miss")

        except Exception as e:
            # We can't show the default e.msg to the user as thats for
            # the combined pattern we sent to regex. Instead we indicate to
            # the user that an ignore file needs fixing.
            logger.error('Invalid pattern found in regex: %s.', e.msg)
            e.msg = "File ~/.bazaar/ignore or .bzrignore contains error(s)."
            bad_patterns = ''
            for _, patterns in self._regex_patterns:
                for p in patterns:
                    if not Globster.is_pattern_valid(p):
                        bad_patterns += ('\n  %s' % p)
            e.msg += bad_patterns
            raise e
        

        return None

    @staticmethod
    def identify(pattern):
        """Returns pattern category.

        :param pattern: normalized pattern.
        Identify if a pattern is fullpath, basename or extension
        and returns the appropriate type.
        """
        if pattern.startswith('RE:') or '/' in pattern:
            return "fullpath"
        elif pattern.startswith('*.'):
            return "extension"
        else:
            return "basename"

    @staticmethod
    def is_pattern_valid(pattern):
        """Returns True if pattern is valid.

        :param pattern: Normalized pattern.
        is_pattern_valid() assumes pattern to be normalized.
        see: globbing.normalize_pattern
        """
        result = True
        translator = Globster.pattern_info[Globster.identify(pattern)]["translator"]
        tpattern = '(%s)' % translator(pattern)
        try:
            re_obj = lazy_regex.lazy_compile(tpattern, re.UNICODE)
            re_obj.search("") # force compile
        except Exception as e:
            result = False
        return result


class ExceptionGlobster(object):
    """A Globster that supports exception patterns.
    
    Exceptions are ignore patterns prefixed with '!'.  Exception
    patterns take precedence over regular patterns and cause a 
    matching filename to return None from the match() function.  
    Patterns using a '!!' prefix are highest precedence, and act 
    as regular ignores. '!!' patterns are useful to establish ignores
    that apply under paths specified by '!' exception patterns.
    """
    
    def __init__(self,patterns, debug):
        ignores = [[], [], []]
        for p in patterns:
            if p.startswith('!!'):
                ignores[2].append(p[2:])
            elif p.startswith('!'):
                ignores[1].append(p[1:])
            else:
                ignores[0].append(p)
        self._ignores = [Globster(i, debug) for i in ignores]
        
    def match(self, filename):
        """Searches for a pattern that matches the given filename.

        :return A matching pattern or None if there is no matching pattern.
        """
            
        double_neg = self._ignores[2].match(filename)
        if double_neg:
            return "!!%s" % double_neg
        elif self._ignores[1].match(filename):
            #print("Ignores")
            return None
        else:
            #print("Normal match")
            return self._ignores[0].match(filename)

class _OrderedGlobster(Globster):
    """A Globster that keeps pattern order."""

    def __init__(self, patterns):
        """Constructor.

        :param patterns: sequence of glob patterns
        """
        # Note: This could be smarter by running like sequences together
        self._regex_patterns = []
        for pat in patterns:
            pat = normalize_pattern(pat)
            t = Globster.identify(pat)
            self._add_patterns([pat], Globster.pattern_info[t]["translator"],
                Globster.pattern_info[t]["prefix"])


_slashes = lazy_regex.lazy_compile(r'[\\/]+')
def normalize_pattern(pattern):
    """Converts backslashes in path patterns to forward slashes.

    Doesn't normalize regular expressions - they may contain escapes.
    """
    if not (pattern.startswith('RE:') or pattern.startswith('!RE:')):
        pattern = _slashes.sub('/', pattern)
    if len(pattern) > 1:
        pattern = pattern.rstrip('/')
    return pattern
