import os
import re

# Import function


def getImportCandidates(client, currentFile, cursorPosition):
    """
    Used by the :TSImport command to get code fixes for name not found errors

    :param client: an instance of the nvim-typescript tsserver client
    :param currentFile: the file currently focused in vim
    :returns: TSServer response with code fixes to add import statements for unfound names
    """

    cannotFindNameError = 2304
    fixes = client.getCodeFixesAtCursor(currentFile, cursorPosition, [cannotFindNameError])
    return fixes["body"] if fixes["success"] else []


def getCurrentImports(client, inspectedFile):
    """
    Lists the existing import statements in a given file

    :param client: a instance of the nvim-typescript tsserver client
    :param inspectedFile: the file from which we should list the import statements
    :returns: a tuple, car: the import statements,
                       cdr: the last line number of the import statements
    """
    imports = [x for x in client.getDocumentSymbols(inspectedFile)["childItems"]
               if x["kind"] == "alias"]

    currentImports = list(map(lambda x: x["text"], imports))

    return currentImports


def convertToDisplayString(displayParts):
    ret = ""
    if not displayParts:
        return ret
    for dp in displayParts:
        ret += dp['text']
    return ret


def getParams(members, separator):
    ret = ''
    for idx, member in enumerate(members):
        if idx == len(member) - 1:
            ret += member['text']
        else:
            ret += member['text'] + separator
    return ret


def getKind(vim, kind):
    if kind in vim.vars["nvim_typescript#kind_symbols"].keys():
        return vim.vars["nvim_typescript#kind_symbols"][kind]
    else:
        return kind


def convert_completion_data(entry, vim):
    kind = getKind(vim, entry['kind'])[0].title()
    return {
        "word": entry["name"],
        "kind": kind
    }


def convert_detailed_completion_data(entry, vim, isDeoplete=False):
    name = entry["name"]
    display_parts = entry["displayParts"]
    signature = "".join([p["text"] for p in display_parts])

    # needed to strip new lines and indentation from the signature
    signature = re.sub("\s+", " ", signature)
    menu_text = re.sub(
        "^(var|let|const|class|\(method\)|\(property\)|enum|namespace|function|import|interface|type)\s+", "", signature)
    documentation = menu_text

    if "documentation" in entry and entry["documentation"]:
        documentation += "\n" + \
            "".join([d["text"] for d in entry["documentation"]])

    kind = getKind(vim, entry['kind'])[0].title()
    if isDeoplete:
        menu = menu_text
    else:
        menu = '{0} {1}'.format(
            vim.vars['nvim_typescript#completion_mark'], menu_text)

    return ({
        "word": name,
        "kind": '{} '.format(kind),
        "menu": menu,
        "info": documentation
    })
