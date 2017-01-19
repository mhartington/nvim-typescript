if exists('g:nvim_typescript#loaded')
  finish
endif
let g:nvim_typescript#loaded = 1
" let g:deoplete#sources#tss#javascript_support =
"       \ get(g:, 'deoplete#sources#tss#javascript_support', 0)
let g:nvim_typescript#max_completion_detail =
      \ get(g:, 'nvim_typescript#max_completion_detail', 25)
let g:nvim_typescript#type_info_on_hold =
      \ get(g:, 'nvim_typescript#type_info_on_hold', 0)
let g:nvim_typescript#signature_complete =
      \ get(g:, 'nvim_typescript#signature_complete', 0)

augroup nvim-typescript
  autocmd!
  if get(g:, 'nvim_typescript#type_info_on_hold', 1)
     autocmd CursorHold *.ts,*.tsx TSType
  endif
  if get(g:, 'nvim_typescript#signature_complete', 1)
     autocmd CompleteDone *.ts,*.tsx TSSig
  endif
augroup end
