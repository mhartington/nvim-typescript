import unittest
from unittest.mock import MagicMock
import tsimport

class TsImportTests(unittest.TestCase):

    def setUp(self):
        pass

    def test_simple(self):
        tsserverOutput = {
        "body": [
         {
           "name": "NavParams",
           "kind": "class",
           "file": "node_modules/ionic-angular/navigation/nav-params.d.ts",
           "start": {
             "line": 23,
             "offset": 1
           },
           "end": {
             "line": 46,
             "offset": 2
           },
           "kindModifiers": "export",
           "matchKind": "exact"
         }]
        }
        client = MagicMock()
        client.getWorkplaceSymbols = MagicMock(return_value=tsserverOutput)
        candidates = tsimport.getImportCandidates(client, '', 'NavParams')
        self.assertTrue(len(candidates) > 0)

    def test_mixedKindModifiers(self):
        tsserverOutput = {
        "body": [
         {
           "name": "NavParams",
           "kind": "class",
           "file": "node_modules/ionic-angular/navigation/nav-params.d.ts",
           "start": {
             "line": 23,
             "offset": 1
           },
           "end": {
             "line": 46,
             "offset": 2
           },
           "kindModifiers": "export,declare",
           "matchKind": "exact"
         }]
        }
        client = MagicMock()
        client.getWorkplaceSymbols = MagicMock(return_value=tsserverOutput)
        candidates = tsimport.getImportCandidates(client, '', 'NavParams')
        self.assertTrue(len(candidates) > 0)

if __name__ == "__main__":
    unittest.main()
