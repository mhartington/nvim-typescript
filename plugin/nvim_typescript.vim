if exists('g:nvim_typescript#loaded')
  finish
endif

" Some settings {{{
let g:nvim_typescript#loaded = 1
let g:nvim_typescript#completion_res = []
let g:nvim_typescript#javascript_support =
      \ get(g:, 'nvim_typescript#javascript_support', 0)
let g:nvim_typescript#vue_support =
      \ get(g:, 'nvim_typescript#vue_support', 0)
let g:nvim_typescript#server_path =
      \ get(g:, 'nvim_typescript#_server_path', 'node_modules/.bin/tsserver')
let g:nvim_typescript#max_completion_detail =
      \ get(g:, 'nvim_typescript#max_completion_detail', 25)
let g:nvim_typescript#type_info_on_hold =
      \ get(g:, 'nvim_typescript#type_info_on_hold', 0)
let g:nvim_typescript#signature_complete =
      \ get(g:, 'nvim_typescript#signature_complete', 0)
let g:nvim_typescript#loc_list_item_truncate_after =
      \ get(g:, 'nvim_typescript#loc_list_item_truncate_after', 20)
let g:nvim_typescript#tsimport#template =
      \ get(g:, 'nvim_typescript#tsimport#template', 'import { %s } from ''%s'';')
let g:nvim_typescript#default_mappings =
      \ get(g:, 'nvim_typescript#default_mappings', 0)
let g:nvim_typescript#completion_mark =
      \ get(g:, 'nvim_typescript#completion_mark', 'TS')
let g:nvim_typescript#debug_enabled =
      \ get(g:, 'nvim_typescript#debug_enabled', 0)
let g:nvim_typescript#debug_settings =
      \ get(g:, 'nvim_typescript#debug_settings', {'file': 'nvim-typescript-tsserver.log', 'level': 'normal'})
let g:nvim_typescript#diagnosticsEnable =
      \ get(g:, 'nvim_typescript#diagnosticsEnable', 1)
let g:nvim_typescript#server_options =
      \ get(g:, 'nvim_typescript#server_options', [])
let g:nvim_typescript#expand_snippet =
      \ get(g:, 'nvim_typescript#expand_snippet', 0)
let g:nvim_typescript#follow_dir_change =
      \ get(g:, 'nvim_typescript#follow_dir_change', 0)
let s:kind_symbols = {
    \ 'keyword': 'keyword',
    \ 'class': 'class',
    \ 'interface': 'interface',
    \ 'script': 'script',
    \ 'module': 'module',
    \ 'local class': 'local class',
    \ 'type': 'type',
    \ 'enum': 'enum',
    \ 'alias': 'alias',
    \ 'type parameter': 'type param',
    \ 'primitive type': 'primitive type',
    \ 'var': 'var',
    \ 'local var': 'local var',
    \ 'property': 'prop',
    \ 'let': 'let',
    \ 'const': 'const',
    \ 'label': 'label',
    \ 'parameter': 'param',
    \ 'index': 'index',
    \ 'function': 'function',
    \ 'local function': 'local function',
    \ 'method': 'method',
    \ 'getter': 'getter',
    \ 'setter': 'setter',
    \ 'call': 'call',
    \ 'constructor': 'constructor'
    \}

let g:nvim_typescript#kind_symbols =
      \ get(g:, 'nvim_typescript#kind_symbols', s:kind_symbols)

let g:nvim_typescript#default_signs =
      \ get(g:, 'nvim_typescript#default_signs', [
      \  {
      \  'TSerror': {
      \   'texthl': 'SpellBad',
      \   'signText': '•',
      \   'signTexthl': 'NeomakeErrorSign'
      \  }
      \},
      \{
      \  'TSwarning': {
      \   'texthl': 'SpellBad',
      \   'signText': '•',
      \   'signTexthl': 'NeomakeWarningSign'
      \  }
      \},
      \{
      \  'TSinformation': {
      \   'texthl': 'SpellBad',
      \   'signText': '•',
      \   'signTexthl': 'NeomakeInfoSign'
      \   }
      \},
      \{
      \  'TShint': {
      \   'texthl': 'SpellBad',
      \   'signText': '?',
      \   'signTexthl': 'NeomakeInfoSign'
      \   }
      \}
      \])

"}}}

augroup nvim-typescript "{{{
  autocmd!

  "FZF stuff
  function! s:TSSearch(query) "{{{
      let l:symbols = TSGetWorkspaceSymbolsFunc(a:query, expand('%'))
      call setloclist(0, l:symbols, 'r', 'Symbols')
      lopen
  endfunction
  command! -nargs=1 TSSearch call s:TSSearch(<q-args>) "}}}

  " Regular JS support {{{
  if get(g:, 'nvim_typescript#javascript_support', 1)
    autocmd BufEnter,Filetype javascript,javascriptreact call nvim_typescript#DefaultKeyMap()
    autocmd BufEnter,Filetype javascript,javascriptreact call TSOnBufEnter()
    autocmd BufWritePost *.js,*.jsx call TSOnBufSave()
    if get(g:, 'nvim_typescript#signature_complete', 1)
       autocmd CompleteDone *.js,*.jsx TSSig
    endif
    if get(g:, 'nvim_typescript#type_info_on_hold', 1)
      autocmd CursorHold *.js,*.jsx TSType
    endif
    if get(g:, 'nvim_typescript#follow_dir_change', 1)
      autocmd DirChanged * call TSOnBufSave()
    endif
    if get(g:, 'nvim_typescript#diagnosticsEnable', 1)
      autocmd BufEnter,Filetype javascript,javascriptreact TSGetDiagnostics
      autocmd TextChanged *.js,*.jsx TSGetDiagnostics
      autocmd InsertLeave *.js,*.jsx TSGetDiagnostics
      autocmd CursorMoved *.js,*.jsx call TSEchoMessage()
    endif
  endif "}}}

  " Vue Support {{{
  if get(g:, 'nvim_typescript#vue_support', 1)
    autocmd BufEnter,Filetype vue call nvim_typescript#DefaultKeyMap()
    autocmd BufEnter,Filetype vue call TSOnBufEnter()
    autocmd BufWritePost *.vue call TSOnBufSave()
    if get(g:, 'nvim_typescript#signature_complete', 1)
       autocmd CompleteDone,Filetype vue TSSig
     autocmd CompleteDone *.vue TSSig
    endif
    if get(g:, 'nvim_typescript#type_info_on_hold', 1)
      autocmd CursorHold *.vue TSType
    endif
    if get(g:, 'nvim_typescript#diagnosticsEnable', 1)
      autocmd BufEnter,Filetype vue TSGetDiagnostics
      autocmd TextChanged *.vue  TSGetDiagnostics
      autocmd InsertLeave *.vue TSGetDiagnostics
      autocmd CursorMoved *.vue call TSEchoMessage()
    endif
  endif "}}}

  " Core {{{
  autocmd BufEnter,Filetype typescript,typescriptreact call nvim_typescript#DefaultKeyMap()
  autocmd BufEnter,Filetype typescript,typescriptreact call TSOnBufEnter()
  autocmd BufWritePost *.ts,*.tsx call TSOnBufSave()
  if get(g:, 'nvim_typescript#signature_complete', 1) "{{{
    autocmd CompleteDone *.ts,*.tsx TSSig
  endif "}}}
  if get(g:, 'nvim_typescript#type_info_on_hold', 1) "{{{
    autocmd CursorHold *.ts,*.tsx TSType
  endif "}}}
  if get(g:, 'nvim_typescript#follow_dir_change', 1) "{{{
    autocmd DirChanged * call TSOnBufSave()
  endif ""}}}
  if get(g:, 'nvim_typescript#diagnosticsEnable', 1) "{{{
    autocmd BufEnter,Filetype typescript,typescriptreact TSGetDiagnostics
    autocmd TextChanged *.ts,*.tsx TSGetDiagnostics
    autocmd InsertLeave *.ts,*.tsx TSGetDiagnostics
    autocmd CursorMoved *.ts,*.tsx call TSEchoMessage()
  endif "}}}

  autocmd BufWritePost tsconfig.json TSReloadProject
  autocmd User CmSetup call cm#sources#typescript#register()
  " Cleanup required to prevent hanging on Windows exit
  autocmd VimLeavePre * TSStop
  "}}}


augroup end "}}}

