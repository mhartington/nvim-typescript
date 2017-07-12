def getKind(vim, kind):
    if kind in vim.vars["nvim_typescript#kind_symbols"].keys():
        return vim.vars["nvim_typescript#kind_symbols"][kind]
    else:
        return kind
