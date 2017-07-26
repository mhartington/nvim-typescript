" Don't do anything if FZF is not installed/loaded
if !exists('g:loaded_fzf')
  finish
endif

augroup nvim-typescript "{{{
    function! s:OpenResult(line)
      let lineWithoutAnsiCodes = substitute(substitute(a:line, '\e\[[0-9;]\+[mK]', '', 'g'), '^\A\+', '', '')
      let fileAndLine = split(l:lineWithoutAnsiCodes, ':')
      execute 'edit' l:fileAndLine[0]
      execute l:fileAndLine[1]
    endfunction

    function! s:FormatResults(query)
        let symbols = TSGetWorkspaceSymbolsFunc(a:query)
        let formattedResults = []
        for item in (l:symbols)
            if exists('g:loaded_webdevicons')
                let icon = WebDevIconsGetFileTypeSymbol(item['filename'], isdirectory(item['filename']))
            else
                let icon = ''
            endif
            call add(
                        \ l:formattedResults,
                        \ icon . '[1;32m' . item['filename'] . '[0m[K:[1;33m' . item['lnum'] . '[0m:[K' . item['text']
                    \)
        endfor
        return l:formattedResults
    endfunction


    function! s:SearchForSymbolsWithPattern(pattern)
      let resultsGetter = s:FormatResults(a:pattern)
      try
        call fzf#run({
        \ 'source':  resultsGetter,
        \ 'down':    '40%',
        \ 'sink':    function('s:OpenResult'),
        \ 'options': '--ansi'})
      catch
        echohl WarningMsg
        echom v:exception
        echohl None
      endtry
    endfunction

    command! -nargs=1 TSSearchFZF call s:SearchForSymbolsWithPattern(<q-args>)
augroup end "}}}
