import vim
from nvim_typescript  import TypescriptHost


_obj = TypescriptHost(vim)
# :r!sed -n '/neovim.function/,+1p' rplugin/python3/nvim_typescript/__init__.py


def TSStop(*args):
    return _obj.tsstop(args)
def TSStart(*args):
    return _obj.tsstart(args)
def TSRestart(*args):
    return _obj.tsrestart(args)
def TSReloadProject(*args):
    return _obj.reloadProject(args)
def TSDoc(*args):
    return _obj.tsdoc(args)
def TSDef(*args):
    return _obj.tsdef(args)
def TSDefPreview(*args):
    return _obj.tsdefpreview(args)
def TSType(*args):
    return _obj.tstype(args)
def TSTypeDef(*args):
    return _obj.tstypedef(args)
def TSGetErr(*args):
    return _obj.tsgeterr(args)
def TSSyncErr(*args):
    return _obj.tssyncerr(args)
def TSRename(*args):
    return _obj.tsrename(args)
def TSImport(*args):
    return _obj.tsimport(args)
def TSGetDocSymbols(*args):
    return _obj.tsgetdocsymbols(args)
def TSExtractFunction(*args):
    return _obj.extractFunction(args)
def TSSig(*args):
    return _obj.tssig(args)
def TSRefs(*args):
    return _obj.tsrefs(args)
def TSEditConfig(*args):
    return _obj.tseditconfig(args)

def TSGetErrFunc(*args):
    return _obj.getErrFunc(args)
def TSGetDocSymbolsFunc(*args):
    return _obj.getDocSymbolsFunc(args)
def TSGetWorkspaceSymbolsFunc(*args):
    return _obj.getWorkspaceSymbolsFunc(args)
def TSComplete(*args):
    return _obj.tsomnifunc(args)
def TSGetServerPath(*args):
    return _obj.tstest(args)
def TSOnBufEnter(*args):
    return _obj.on_bufenter(args)
def TSOnBufSave(*args):
    return _obj.on_bufwritepost(args)
def TSCmRefresh(*args):
    return _obj.on_cm_refresh(args)
