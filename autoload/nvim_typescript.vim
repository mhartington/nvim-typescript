function! nvim_typescript#DefaultKeyMap()
  if get(g:, 'nvim_typescript#default_mappings', 1)
    execute 'nnoremap <buffer> <silent> K'  ':TSDoc<CR>'
    execute 'nnoremap <buffer> <silent> <leader>tdp'  ':TSDefPreview<CR>'
    execute 'nnoremap <buffer> <silent> <c-]>'  ':TSTypeDef<CR>'
  endif
endfunction
