if exists('g:loaded_deoplete_ts')
  finish
endif
let g:loaded_deoplete_ts = 1


" let g:deoplete#sources#tss#javascript_support =
"       \ get(g:, 'deoplete#sources#tss#javascript_support', 0)

let g:deoplete#sources#tss#max_completion_detail =
      \ get(g:, 'deoplete#sources#tss#max_completion_detail', 25)
