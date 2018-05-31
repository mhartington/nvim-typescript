# Nvim-Typescript


Nvim language service plugin for typescript

![](https://github.com/mhartington/nvim-typescript/blob/master/deoplete-tss.gif)


## Installation

First make sure you have Neovim 0.2.1 or highter. 
This includes the node-host that is required for this plugin.

You will need a global install of the neovim client as well.

```bash
npm install -g neovim
```

You also need to have typescript installed globally.

```bash
npm -g install typescript
```

Then add the following plugins. This example uses Dein.vim, but any plugin manager will work.

```viml
 " Dein
  call dein#add('mhartington/nvim-typescript')
 " For async completion
   call dein#add('Shougo/deoplete.nvim')


 " Plug
  Plug 'mhartington/nvim-typescript'
 " For async completion
  Plug 'Shougo/deoplete.nvim'

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

- [ ] Refactor client to support `geterr` request
- [ ] Add `TSGetErr`
