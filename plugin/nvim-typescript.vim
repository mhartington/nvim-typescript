if exists('g:loaded_deoplete_ts')
  finish
endif
let g:loaded_deoplete_ts = 1
" let g:deoplete#sources#tss#javascript_support =
"       \ get(g:, 'deoplete#sources#tss#javascript_support', 0)
let g:nvim_typescript#max_completion_detail =
      \ get(g:, 'nvim_typescript#max_completion_detail', 25)
let g:nvim_typescript#type_info#on_hold =
      \ get(g:, 'nvim_typescript#type_info#on_hold', 0)


augroup nvim-typescript
  autocmd!
  if get(g:, 'nvim_typescript#type_info#on_hold', 1)
     autocmd CursorHold *.ts,*.tsx TSType
  endif
augroup end

let g:callTime = 0
function! Logger() abort
  let g:callTime =  g:callTime + 1
  echom 'called ' . g:callTime
endfunction
