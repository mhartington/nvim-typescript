========
Globster
========

Tools for converting globs to regular expressions.

This work is derived from `Bazaar <http://bazaar.canonical.com/en/>`_ (bzrlib) and `Mikko Ohtamaa <https://github.com/miohtama/vvv/tree/master/vvv/bzrlib>`_. I just created the Python package.

Usage
-----

.. code-block:: python

    from globster import Globster

    g = Globster(["mydir/", "*.pyc"])
    if g.match("/path/to/dir/myscript.pyc"):
        print "it match"


    if g.match("/path/to/mydir"):
        print "it match"


License (GPLv2)
---------------

This program is free software; you can redistribute it and/or modify
it under the terms of the GNU General Public License as published by
the Free Software Foundation; either version 2 of the License, or
(at your option) any later version.

This program is distributed in the hope that it will be useful,
but WITHOUT ANY WARRANTY; without even the implied warranty of
MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
GNU General Public License for more details.

You should have received a copy of the GNU General Public License
along with this program; if not, write to the Free Software
Foundation, Inc., 51 Franklin Street, Fifth Floor, Boston, MA 02110-1301 USA