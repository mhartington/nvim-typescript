
func! ncm2#nvim_typescript#init()
    let scope = ['typescript', 'tsx', 'typescript.tsx', 'typescriptreact']
    if g:nvim_typescript#javascript_support
        call extend(scope, ['javascript', 'jsx', 'javascript.jsx'])
      endif
    if g:nvim_typescript#vue_support
        call insert(scope, 'vue')
    endif
    " the omnifunc pattern is PCRE
    call ncm2#register_source({'name' : 'typescript',
            \ 'priority': 9,
            \ 'scope': scope,
            \ 'mark': g:nvim_typescript#completion_mark,
            \ 'complete_pattern':['\.', '::'],
            \ 'on_complete': 'ncm2#nvim_typescript#on_complete',
            \ })
endfunc

func! ncm2#nvim_typescript#on_complete(ctx)
    call TSNcm2OnComplete(a:ctx)
endfunc

