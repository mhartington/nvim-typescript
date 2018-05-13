" nvim-completion-manager source
func! cm#sources#typescript#register()
    let scopes = ['typescript', 'tsx', 'typescript.tsx']
    if g:nvim_typescript#javascript_support
        call extend(scopes, ['javascript', 'jsx', 'javascript.jsx'])
      endif
    if g:nvim_typescript#vue_support
        call insert(scopes, 'vue')
    endif
    " the omnifunc pattern is PCRE
    call cm#register_source({'name' : 'typescript',
            \ 'priority': 9,
            \ 'scopes': scopes,
            \ 'abbreviation': g:nvim_typescript#completion_mark,
            \ 'cm_refresh_patterns':['\.', '::'],
            \ 'cm_refresh': 'cm#sources#typescript#refresh',
            \ })

endfunc


func! cm#sources#typescript#refresh(info, ctx)
    call TSCmRefresh(a:info, a:ctx)
endfunc

