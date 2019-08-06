let s:error_symbol = get(g:, 'airline#extensions#nvim_typescript#error_symbol', 'E:')
let s:warning_symbol = get(g:, 'airline#extensions#nvim_typescript#warning_symbol', 'W:')

function! airline#extensions#nvim_typescript#get_warning() "{{{
  return airline#extensions#nvim_typescript#get('warning')
endfunction "}}}

function! airline#extensions#nvim_typescript#get_error() "{{{
  return airline#extensions#nvim_typescript#get('error')
endfunction "}}}

function! airline#extensions#nvim_typescript#get(type) "{{{
  let is_err = (a:type  is# 'error')
  let info = get(b:, 'nvim_typescript_diagnostic_info', [])
  if empty(info)
    return ''
  else
    let formatted = filter(copy(info),"v:val['category'] == a:type")
    if empty(formatted) | return '' | endif
    return (is_err ? s:error_symbol : s:warning_symbol).len(formatted)
  endif
endfunction "}}}

function! airline#extensions#nvim_typescript#init(ext) "{{{
  call airline#parts#define_raw('nvim_typescript_error_count',   '%{airline#extensions#nvim_typescript#get_warning}')
  call airline#parts#define_raw('nvim_typescript_warning_count', '%{airline#extensions#nvim_typescript#get_error}')

  call a:ext.add_statusline_func('airline#extensions#nvim_typescript#apply')
endfunction "}}}

function! airline#extensions#nvim_typescript#apply(...) "{{{
  if get(g:, 'nvim_typescript#diagnostics_enable',  1)
        \&&  &filetype == "typescript"
        \|| &filetype == "typescript.tsx"
    let w:airline_section_warning = get(w:, 'airline_section_warning', g:airline_section_warning)
    let w:airline_section_warning .= '%{airline#extensions#nvim_typescript#get_warning()}'

    let w:airline_section_error = get(w:, 'airline_section_error', g:airline_section_error)
    let w:airline_section_error .= '%{airline#extensions#nvim_typescript#get_error()}'
  endif
endfunction "}}}
