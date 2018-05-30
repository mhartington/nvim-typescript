" Don't do anything if FZF is not installed/loaded
if !exists('g:loaded_fzf')
  finish
endif

augroup nvim-typescript "{{{
    function! s:OpenResult(line)
      let fileAndLine = split(a:line, ':')
      execute 'edit' l:fileAndLine[1]
      execute l:fileAndLine[2]
    endfunction

    function! s:FormatResults(query)
        let symbols = TSGetWorkspaceSymbolsFunc(a:query, expand("%:."))
        let formattedResults = []
        for item in (l:symbols)
            if exists('g:loaded_webdevicons')
                let icon = WebDevIconsGetFileTypeSymbol(item['filename'], isdirectory(item['filename']))
            else
                let icon = ''
            endif
            call add(
                        \ l:formattedResults,
                        \ icon . ' : ' . fnamemodify(item['filename'], ":.") . ' : ' . item['lnum'] . ' : ' . item['text']
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
        \ 'options': '--ansi --color=16'})
      catch
        echohl WarningMsg
        echom v:exception
        echohl None
      endtry
    endfunction

    command! -nargs=1 TSSearchFZF call s:SearchForSymbolsWithPattern(<q-args>)
augroup end "}}}
