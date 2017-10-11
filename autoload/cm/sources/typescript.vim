" nvim-completion-manager source

func! cm#sources#typescript#register()
    " the omnifunc pattern is PCRE
    call cm#register_source({'name' : 'typescript',
            \ 'priority': 9, 
            \ 'scopes': ['typescript'],
            \ 'abbreviation': 'ts',
            \ 'cm_refresh_patterns':['\.', '::'],
            \ 'cm_refresh': 'cm#sources#typescript#refresh',
            \ })

endfunc


func! cm#sources#typescript#refresh(info, ctx)
    call TSCmRefresh(a:info, a:ctx)
endfunc

