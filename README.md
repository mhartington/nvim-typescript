# nvim-typescript

TypeScript support for neovim.

`nvim-typescript` provides standard IDE-like features such as auto-completion
(with the aid of [deoplete.nvim](https://github.com/Shougo/deoplete.nvim)),
viewing of documentation and type-signatures, go to definition, and reference
finding.

![](https://github.com/mhartington/nvim-typescript/blob/master/deoplete-tss.gif)

## Installation

### Prerequisites

* Python3 neovim bindings
* Deoplete (if you want code completion)
* A TypeScript syntax file (to set the filetype), a popular choice is
  [yats.vim](https://github.com/HerringtonDarkholme/yats.vim)

### Install nvim-typescript

This example uses Dein.vim, but any plugin manager will work.

```viml
" Dein
  call dein#add('Shougo/deoplete.nvim')
  call dein#add('mhartington/nvim-typescript')

" Enable deoplete at startup
  let g:deoplete#enable_at_startup = 1
```

Then run `:UpdateRemotePlugins` when you first launch nvim after installing the
plugin.

## Features

See the
[documentation](https://github.com/mhartington/nvim-typescript/blob/master/doc/nvim-typescript.txt)
(or within nvim `:help nvim-typescript` for a complete list of commands and
features.

## Debugging

### Deoplete completion

There are a few things you'll have to modify in your vim config in order to be
able to effectively work on this plugin:

```viml
  call dein#local('~/GitHub', {},['nvim-typescript'])

  let g:deoplete#enable_at_startup = 1
  let g:deoplete#enable_debug = 1
  let g:deoplete#enable_profile = 1
  call deoplete#enable_logging('DEBUG', '/PATH_TO/deoplete.log')
```

You will now be able to `tail -f /PATH_TO/deoplete.log`, and see debug output
appear.

## Troubleshooting

Run `:CheckHealth` and check if everything is green, if not instructions on how
to fix the issue should be provided.

## How to Make This Everyone's Code

If you happened to build something and would love to make a PR, I would be more
than happy to add contributors. If something you do add happens to get merged
(most likely it will :grin: ) you'll get a collaborator request. This has
worked out very well in the Node community and I want it to happen here. This
is as much my code as it is your code. See [this
site](http://openopensource.org) and [this
talk](https://youtu.be/wIUkWpg9FDY?t=5m10s) for more info.
