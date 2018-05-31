# Nvim-Typescript


Nvim language service plugin for typescript

![](https://github.com/mhartington/nvim-typescript/blob/master/deoplete-tss.gif)

This is alpha-ish :smile:

## Installation

First make sure you have python3 bindings installed for neovim
If :echo has("python3") returns 1, then you're done.
If not, run

```bash
sudo pip3 install neovim
```

[zchee](https://github.com/zchee/deoplete-jedi/wiki/Setting-up-Python-for-Neovim) has provided an in depth guide to setting up neovim with python bindings

You also need to have typescript installed globally.

```
npm -g install typescript
```
In the future, I'd like to add a variable to allow use of local npm installs instead of global installs.

Then add the following plugins. This example uses Dein.vim, but any plugin manager will work.

```viml
 " Dein
  call dein#add('Shougo/deoplete.nvim')
  call dein#add('mhartington/nvim-typescript')

 " Plug
  Plug 'Shougo/deoplete.nvim'
  Plug 'mhartington/nvim-typescript'

" Enable deoplete at startup

  let g:deoplete#enable_at_startup = 1
```

## Limitation

Currently, this plugin requires a `tsconfig.json` to be present in the current working directory. This is how we can feed TSS proper project information, like modules and files. See [this issue](https://github.com/mhartington/nvim-typescript/issues/10) for clarification.

If no completion is happening, please be sure to have a Typescript syntax file in your RTP. Neovim does not include a default syntax for Typescript, so be sure to include one. A popular syntax file for Typescript is [yats.vim](https://github.com/HerringtonDarkholme/yats.vim)

## Open Open Source, or how to make this everyone's code

If you happened to build something and would love to make a PR, I would be more than happy to add contributors.
If something you do add happens to get merged (most likely it will :grin: ) you'll get a collaborator request. This has worked out very well in the Node community and I want it to happen here. This is as much my code as it is your code.

See:
- [this site](http://openopensource.org)
- [this talk](https://youtu.be/wIUkWpg9FDY?t=5m10s)

## Debugging

There are a few things you'll have to modify in your vim config in order to be able to effectively work on this plugin:

```viml
  call dein#local('~/GitHub', {},['nvim-typescript'])

  let g:deoplete#enable_at_startup = 1
  let g:deoplete#enable_debug = 1
  let g:deoplete#enable_profile = 1
  call deoplete#enable_logging('DEBUG', '/PATH_TO/deoplete.log')
```

 You will now be able to `tail -f /PATH_TO/deoplete.log`, and see debug output appear.


## TODOS

- [x] Refactor `TSDoc`, print docs to split.
- [ ] Add `TSRename`
- [ ] Refactor client to support `geterr` request
- [ ] Add `TSGetErr`
- [x] Use local install of `tsserver` and not global
