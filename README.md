## Deoplete-Typescript

This is the deoplete source for typescript via [tsuquyomi](https://github.com/Quramy/tsuquyomi)

## Installation

First make sure you have python3 bindings installed for neovim
If :echo has("python3") returns 1, then you're done.
If not, run

```bash
sudo pip3 install neovim
```

You also need to have typescript installed globally.

```
npm -g install typescript

```

Then add the following plugins. This example uses NeoBundle, but any plugin manager will work.

```viml
  NeoBundle 'Shougo/vimproc.vim', {
  \ 'build' : {
  \     'windows' : 'tools\\update-dll-mingw',
  \     'cygwin' : 'make -f make_cygwin.mak',
  \     'mac' : 'make -f make_mac.mak',
  \     'linux' : 'make',
  \     'unix' : 'gmake',
  \    },
  \ }

  NeoBundle 'Quramy/tsuquyomi'
  NeoBundle 'Shougo/deoplete.nvim'

" Enable deoplete at startup

  let g:deoplete#enable_at_startup = 1
```

## Warning

This is mostly just testing for myself.

Now for larger project, tsuquyomi can get pretty slow. Now it could be possible to build a typescript daemon in node for deoplete, which could be much faster and also run asynchronously. This is actually how editors like Atom and VSCode talk to the typescript compiler to provide completion. If this is something you would want, please bump this [issue](https://github.com/Quramy/tsuquyomi/issues/57)

If you happened to build something and would love to make a PR, I would be more than happy to add contributors.
