import sys
sys.path.append('..')
import unittest
from unittest.mock import MagicMock
import utils
import json
import glob

class TsGetImportCandidatesTests(unittest.TestCase):
    pass

def generateCandidatesTest(currentFile, symbol, expected, tsserverOutput):
    def test(self):
        client = MagicMock()
        client.getWorkspaceSymbols = MagicMock(return_value=tsserverOutput)
        candidates = utils.getImportCandidates(client, currentFile,symbol)
        self.assertEqual(candidates, expected)
    return test

# Generate utils.getImportCandidates tests
for f in glob.glob('./testData/importCandidatesTests/*.json'):
    with open(f, 'r') as fd:
        testData = json.loads(fd.read())
        test_name = 'test_%s' % f
        test = generateCandidatesTest(testData['currentFile'], testData['input'], testData['expected'], testData['tsserverOutput'])
        setattr(TsGetImportCandidatesTests, test_name, test)

class TSGetRelativeImportPathTests(unittest.TestCase):
    pass

# Generate utils.getRelativeImportPath tests
relativeImportPathTests = [
        ['fromNodeModules1', '/home/user/repos/maverick/src/main.ts', '/home/user/repos/maverick/node_modules/opty/index.d.ts', 'opty'],
        ['fromNodeModules2', '/home/user/repos/maverick/src/main.ts', '/Users/user/GitHub/tmp/node_modules/ionic-angular/index.d.ts', 'ionic-angular'],

        ['fromLocalModule0', '/Users/user/project/src/index.ts', '/Users/user/project/src/MyModule/module.ts', './MyModule/module'],
        ['fromLocalModule1', '/Users/user/project/src/modA/index.ts', '/Users/user/project/src/modA/someModule.ts', './someModule'],
        ['fromLocalModule2', '/Users/user/project/src/index.ts', '/Users/user/project/src/modA/index.ts', './modA'],
        ['fromLocalModule3', '/Users/user/project/src/modA/mobB/index.ts', '/Users/user/project/src/index.ts', '../..'],
        ['fromLocalModule4', '/Users/user/project/src/modA/mobB/index.ts', '/Users/user/project/src/someFile.ts', '../../someFile']
]

def generateImportPathTests(currentFile, symbolFile, expected):
    def test(self):
        self.assertEqual(utils.getRelativeImportPath(currentFile, symbolFile), expected)
    return test


for test in relativeImportPathTests:
    test_name = 'test_%s' % test[0]
    test = generateImportPathTests(test[1], test[2], test[3])
    setattr(TSGetRelativeImportPathTests, test_name, test)

if __name__ == '__main__':
    unittest.main()
