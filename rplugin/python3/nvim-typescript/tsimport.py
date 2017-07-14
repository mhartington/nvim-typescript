import os
import re

def getImportCandidates(client, cfile, symbol):
    matchingSymbols = client.getWorkplaceSymbols(cfile, symbol)
    return [*map(lambda x: x["file"], [x for x in matchingSymbols["body"]
        if x['matchKind'] == "exact" and ('kindModifiers' in x) and 'export' in x['kindModifiers'].split(',')])]

def shaveNodeModulesPath(candidate):
    return re.sub('^.*node_modules/', '', candidate)

def getRelativeImportPath(destinationFile, importFromFile):
    destinationFileDir = os.path.dirname(os.path.abspath(destinationFile))
    importFromFileDir = os.path.dirname(os.path.abspath(importFromFile))
    symbolFile = os.path.basename(importFromFile)
    if 'node_modules' in importFromFile:
        relativePath = shaveNodeModulesPath(importFromFileDir)
    else:
        relativePath = os.path.relpath(importFromFileDir, destinationFileDir)
    if symbolFile == "index.ts":
        return relativePath
    else:
        return "{}/{}".format(relativePath, symbolFile)

def createImportBlock(symbol, importPath, template):
    return template % (symbol, importPath)

def getCurrentImports(client, inspectedFile):
    imports = [x for x in client.getDocumentSymbols(inspectedFile)["body"]["childItems"]
            if x["kind"] == "alias"]

    importLineLocations = sorted([*map(lambda x: x["spans"][0]["end"]["line"], imports)])
    lastImportLine = 0

    if len(importLineLocations) > 0:
        lastImportLine = importLineLocations[-1]

    return ([*map(lambda x: x["text"], imports)], lastImportLine)
