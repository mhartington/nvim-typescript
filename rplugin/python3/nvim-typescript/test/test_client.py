import sys
sys.path.append('..')
import unittest
from unittest import mock
import utils
import json
import glob
from client import Client
from os import getcwd

class TsFindTsConfigTests(unittest.TestCase):
    @mock.patch('os.getcwd')
    def test_openAtProjectRoot(self, mock_os_cwd):
        mock_os_cwd = '%s/testData/fakeRepo' % getcwd()
        clientInstance = Client()
        projectRoot = clientInstance.project_cwd(mock_os_cwd)
        self.assertEqual(projectRoot, '%s/testData/fakeRepo' % getcwd())

    @mock.patch('os.getcwd')
    def test_openInModuleFolder(self, mock_os_cwd):
        mock_os_cwd = '%s/testData/fakeRepo/src/module/' % getcwd()
        clientInstance = Client()
        projectRoot = clientInstance.project_cwd(mock_os_cwd)
        self.assertEqual(projectRoot, '%s/testData/fakeRepo' % getcwd())


    @mock.patch('os.getcwd')
    def test_openFile(self, mock_os_cwd):
        mock_os_cwd = '%s/testData/fakeRepo/src/module/file.ts' % getcwd()
        clientInstance = Client()
        projectRoot = clientInstance.project_cwd(mock_os_cwd)
        self.assertEqual(projectRoot, '%s/testData/fakeRepo' % getcwd())

    @mock.patch('os.getcwd')
    def test_notFound(self, mock_os_cwd):
        mock_os_cwd = '/random/no/dir/project'
        clientInstance = Client()
        projectRoot = clientInstance.project_cwd(mock_os_cwd)
        self.assertFalse(projectRoot)
