## Deoplete-Typescript

This is the deoplete source for typescript.

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
  call dein#add('mhartington/deoplete-typescript')

 " Plug
  Plug 'Shougo/deoplete.nvim'
  Plug 'mhartington/deoplete-typescript'

" Enable deoplete at startup

  let g:deoplete#enable_at_startup = 1
```

## Experimental Javascript support

Did you know Typescript can provide completion and type checking for Javascript? You can enable Javascript completion through TSS by added this variable to your vimrc/init.vim

```viml
let g:deoplete#sources#tss#javascript_support = 1
```

## Limitation

Currently, this plugin requires a `tsconfig.json` to be present in the current working directory. This is how we can feed TSS proper project information, like modules and files. See [this issue](https://github.com/mhartington/deoplete-typescript/issues/10) for clarification.

## Open Open Source, or how to make this everyone's code

If you happened to build something and would love to make a PR, I would be more than happy to add contributors.
If something you do add happens to get merged (most likely it will :grin: ) you'll get a collaborator request. This has worked out very well in the Node community and I want it to happen here. This is as much my code as it is your code.

See:
- [this site](http://openopensource.org)
- [this talk](https://youtu.be/wIUkWpg9FDY?t=5m10s)

