# Nvim-Typescript

## DEPRECATED

[The time has finally come](https://github.com/neovim/nvim-lspconfig/blob/master/CONFIG.md#tsserver). Since Neovim 0.5 is out, and LSP is officially supported, I'd suggest you migrate over to it. I have been using it instead of this plugin for a while and it solves many pain points that I've not been able to. This will stay around for older neovim release, but everyone should upgrade. Thanks for the support and for using this plugin 🚀



nvim language service plugin for typescript

![](https://github.com/mhartington/nvim-typescript/blob/master/deoplete-tss.gif)


## Installation

First make sure you have Neovim 0.3.8 or higher.
This includes the node-host that is required for this plugin.

You will need a global install of the neovim client as well.
This will make sure that neovim and node can communicate.


```bash
npm install -g neovim
```

After installing the neovim client, you will have to run `:UpdateRemotePlugins`.

You might want to also have typescript install globally.
By default, this plugin will look in your `node_modules` folder first for typescript, but if that does not exist, it will use the global install.

```bash
npm -g install typescript
```

Then add the following plugins. This example shows [Dein.vim](https://github.com/Shougo/dein.vim) and  [Plug.vim](https://github.com/junegunn/vim-plug), but any plugin manager will work.

```viml
 " Dein
 # REQUIRED: Add a syntax file. YATS is the best
  call dein#add('HerringtonDarkholme/yats.vim')
  call dein#add('mhartington/nvim-typescript', {'build': './install.sh'})
 " For async completion
  call dein#add('Shougo/deoplete.nvim')
 " For Denite features
  call dein#add('Shougo/denite.nvim')


 " Vim-Plug
 # REQUIRED: Add a syntax file. YATS is the best
  Plug 'HerringtonDarkholme/yats.vim'
  Plug 'mhartington/nvim-typescript', {'do': './install.sh'}
 " For async completion
  Plug 'Shougo/deoplete.nvim'
 " For Denite features
  Plug 'Shougo/denite.nvim'


" Enable deoplete at startup

  let g:deoplete#enable_at_startup = 1
```

If errors occur after installing, make sure to run `./install.sh` in the plugin
directory.  And try to run `:UpdateRemotePlugins` if you haven't already.

## Limitation

If no completion is happening, please be sure to have a Typescript syntax file in your RTP. Older versions of Neovim do not include a default syntax for Typescript, so be sure to include one. A popular syntax file for Typescript is [yats.vim](https://github.com/HerringtonDarkholme/yats.vim). As of v0.4.3, Neovim includes a default Typescript syntax file that is based off yats. Running nvim-typescript with no syntax file could lead to unexpected behavior.

## Open Open Source, or how to make this everyone's code

If you happened to build something and would love to make a PR, I would be more than happy to add contributors.
If something you do add happens to get merged (most likely it will :grin: ) you'll get a collaborator request. This has worked out very well in the Node community and I want it to happen here. This is as much my code as it is your code.

See:
- [this site](https://openopensource.github.io/)
- [this talk](https://youtu.be/wIUkWpg9FDY?t=5m10s)

## Debugging

There are a few things you'll have to modify in your nvim config in order to be able to effectively work on this plugin:

```viml
  call dein#local('~/GitHub', {},['nvim-typescript'])
  let $NVIM_NODE_LOG_FILE='nvim-node.log'
  let $NVIM_NODE_LOG_LEVEL='warn'

```
 This plug will try to log most things to warn as the node-client logs a lot of verbose output to debug/info.
 You will now be able to `tail -f /PATH_TO/nvim-node.log`, and see debug output appear.


## TODOS

If there's a feature that you would like to see, feel free to open an issue or send a PR.


Like this plugin? Buy me a coffee on [KoFI](http://ko-fi.com/mhartington)
