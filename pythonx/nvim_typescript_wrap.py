import vim
from nvim_typescript  import TypescriptHost


_obj = TypescriptHost(vim)
# :r!sed -n '/neovim.function/,+1p' rplugin/python3/nvim_typescript/__init__.py


def TSStop(*args):
    return _obj.tsstop()
def TSStart(*args):
    return _obj.tsstart()
def TSRestart(*args):
    return _obj.tsrestart()
def TSReloadProject(*args):
    return _obj.reloadProject()
def TSDoc(*args):
    return _obj.tsdoc()
def TSDef(*args):
    return _obj.tsdef()
def TSDefPreview(*args):
    return _obj.tsdefpreview()
def TSType(*args):
    return _obj.tstype()
def TSTypeDef(*args):
    return _obj.tstypedef()
def TSGetErr(*args):
    return _obj.tsgeterr()
def TSSyncErr(*args):
    return _obj.tssyncerr(args)
def TSRename(*args):
    return _obj.tsrename(args)
def TSImport(*args):
    return _obj.tsimport()
def TSGetDocSymbols(*args):
    return _obj.tsgetdocsymbols()
def TSExtractFunction(*args):
    return _obj.extractFunction(args)
def TSSig(*args):
    return _obj.tssig()
def TSRefs(*args):
    return _obj.tsrefs()
def TSEditConfig(*args):
    return _obj.tseditconfig()

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
