let s:local_tss = 0

function! s:check_node() abort "{{{
  call health#report_start('Find Node')
  if executable('node')
    call health#report_ok('node is in $PATH')
  else
    call health#report_error('node is not in $PATH',
          \ 'Typescript requires node')
  endif
endfunction "}}}

function! s:check_local_tsserver() abort "{{{
  call health#report_start('Find Local Typescript')
  let l:localServer = getcwd().'/node_modules/.bin/tsserver'
  if executable(l:localServer)
    let s:local_tss = 1
    call health#report_ok('local tsserver is found')
  else
    call health#report_warn('No local server found, using global',
          \"Install typescript locally for more accurate tooling\n".
          \'$ npm install typescript --save-dev')
  endif
endfunction "}}}

function! s:check_global_tsserver() abort "{{{
  call health#report_start('Find Global Typescript')
  if executable('tsserver')
    call health#report_ok('global tsserver is found')
  elseif s:local_tss
    call health#report_ok('No global server found but local server found')
  else
    call health#report_error('No global server found and no local server',
          \"Install typescript globally or locally\n".
          \"$ npm install -g typescript\n".
          \'$ npm install typescript --save-dev')
  endif
endfunction "}}}

function! s:check_required_node_for_nvim_typescript() abort "{{{
  call health#report_start('Check for node bindings')
  if has('nvim-0.2.1')
    call health#report_ok('node bindings found')
  else
    call health#report_error('node bindings were not found', [
          \ 'Please update to a newer version of neovim.',
          \ ])
  endif
endfunction "}}}

function! health#nvim_typescript#check() abort
  call s:check_node()
  call s:check_local_tsserver()
  call s:check_global_tsserver()
  call s:check_required_node_for_nvim_typescript()
endfunction


