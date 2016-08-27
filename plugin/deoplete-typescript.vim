if exists('g:loaded_deoplete_tss')
  finish
endif
let g:loaded_deoplete_tss = 1


let g:deoplete#sources#tss#javascript_support =
      \ get(g:, 'deoplete#sources#tss#javascript_support', 0)
