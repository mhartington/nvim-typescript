
if has('nvim')
    finish
endif

let s:ts = yarp#py3('nvim_typescript_wrap')

com -nargs=* TSStop call call(s:ts.request, ['TSStop'] + [<f-args>], s:ts)
com -nargs=* TSStart call call(s:ts.request, ['TSStart'] + [<f-args>], s:ts)
com -nargs=* TSRestart call call(s:ts.request, ['TSRestart'] + [<f-args>], s:ts)
com -nargs=* TSReloadProject call call(s:ts.request, ['TSReloadProject'] + [<f-args>], s:ts)
com -nargs=* TSDoc call call(s:ts.request, ['TSDoc'] + [<f-args>], s:ts)
com -nargs=* TSDef call call(s:ts.request, ['TSDef'] + [<f-args>], s:ts)
com -nargs=* TSDefPreview call call(s:ts.request, ['TSDefPreview'] + [<f-args>], s:ts)
com -nargs=* TSType call call(s:ts.request, ['TSType'] + [<f-args>], s:ts)
com -nargs=* TSTypeDef call call(s:ts.request, ['TSTypeDef'] + [<f-args>], s:ts)
com -nargs=* TSGetErr call call(s:ts.request, ['TSGetErr'] + [<f-args>], s:ts)
com -nargs=* TSSyncErr call call(s:ts.request, ['TSSyncErr'] + [<f-args>], s:ts)
com -nargs=* TSRename call call(s:ts.request, ['TSRename'] + [<f-args>], s:ts)
com -nargs=* TSImport call call(s:ts.request, ['TSImport'] + [<f-args>], s:ts)
com -nargs=* TSGetDocSymbols call call(s:ts.request, ['TSGetDocSymbols'] + [<f-args>], s:ts)
com -nargs=* TSExtractFunction call call(s:ts.request, ['TSExtractFunction'] + [<f-args>], s:ts)
com -nargs=* TSSig call call(s:ts.request, ['TSSig'] + [<f-args>], s:ts)
com -nargs=* TSRefs call call(s:ts.request, ['TSRefs'] + [<f-args>], s:ts)
com -nargs=* TSEditConfig call call(s:ts.request, ['TSEditConfig'] + [<f-args>], s:ts)


func! TSGetErrFunc(...)
    return call(s:ts.request, ['TSGetErrFunc'] + a:000, s:ts)
endfunc
func! TSGetDocSymbolsFunc(...)
    return call(s:ts.request, ['TSGetDocSymbolsFunc'] + a:000, s:ts)
endfunc
func! TSGetWorkspaceSymbolsFunc(...)
    return call(s:ts.request, ['TSGetWorkspaceSymbolsFunc'] + a:000, s:ts)
endfunc
func! TSComplete(...)
    return call(s:ts.request, ['TSComplete'] + a:000, s:ts)
endfunc
func! TSGetServerPath(...)
    return call(s:ts.request, ['TSGetServerPath'] + a:000, s:ts)
endfunc
func! TSOnBufEnter(...)
    return call(s:ts.request, ['TSOnBufEnter'] + a:000, s:ts)
endfunc
func! TSOnBufSave(...)
    return call(s:ts.request, ['TSOnBufSave'] + a:000, s:ts)
endfunc
func! TSCmRefresh(...)
    return call(s:ts.request, ['TSCmRefresh'] + a:000, s:ts)
endfunc

" @neovim.command("TSStop")
" @neovim.command("TSStart")
" @neovim.command("TSRestart")
" @neovim.command("TSReloadProject")
" @neovim.command("TSDoc")
" @neovim.command("TSDef")
" @neovim.command("TSDefPreview")
" @neovim.command("TSType")
" @neovim.command("TSTypeDef")
" @neovim.command("TSGetErr")
" @neovim.command("TSSyncErr")
" @neovim.command("TSRename", nargs="*")
" @neovim.command("TSImport")
" @neovim.command("TSGetDocSymbols")
" @neovim.command("TSExtractFunction", range='')
" @neovim.command("TSSig")
" @neovim.command("TSRefs")
" @neovim.command("TSEditConfig")
" @neovim.function("TSGetErrFunc")
" @neovim.function("TSGetDocSymbolsFunc", sync=True)
" @neovim.function("TSGetWorkspaceSymbolsFunc", sync=True)
" @neovim.function('TSComplete', sync=True)
" @neovim.function('TSGetServerPath', sync=True)
" @neovim.function('TSOnBufEnter')
" @neovim.function('TSOnBufSave')
" @neovim.function('TSCmRefresh', sync=False)

