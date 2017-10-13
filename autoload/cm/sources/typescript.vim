" nvim-completion-manager source

func! cm#sources#typescript#register()
    let scopes = ['typescript']
    if g:nvim_typescript#javascript_support
        call insert(scopes, 'javascript')
    endif
    " the omnifunc pattern is PCRE
    call cm#register_source({'name' : 'typescript',
            \ 'priority': 9, 
            \ 'scopes': scopes,
            \ 'abbreviation': 'ts',
            \ 'cm_refresh_patterns':['\.', '::'],
            \ 'cm_refresh': 'cm#sources#typescript#refresh',
            \ })

endfunc


func! cm#sources#typescript#refresh(info, ctx)
    call TSCmRefresh(a:info, a:ctx)
endfunc

