import os
from setuptools import setup


def read(fname):
    return open(os.path.join(os.path.dirname(__file__), fname)).read()

setup(
    name="globster",
    version="0.1.0",
    author="Thomas Sileo",
    author_email="thomas.sileo@gmail.com",
    description="Convert shell-like globs to regular expressions",
    license="GPLv2",
    keywords="some keyword",
    url="https://github.com/tsileo/globster",
    py_modules=["globster"],
    long_description=read("README.rst"),
    install_requires=[],
    classifiers=[
        "Development Status :: 4 - Beta",
        "Intended Audience :: Developers",
        "License :: OSI Approved :: GNU General Public License v2 (GPLv2)",
        "Programming Language :: Python",
    ],
    scripts=["globster.py"],
#    test_suite="test_globster",
)
