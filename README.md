## Deoplete-Typescript

This is the deoplete source for typescript.

This is alpha..

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

  call dein#add('Shougo/deoplete.nvim')
  call dein#add('mhartington/deoplete-typescript')

" Enable deoplete at startup

  let g:deoplete#enable_at_startup = 1
```

## Warning

This is mostly just testing for myself.

If you happened to build something and would love to make a PR, I would be more than happy to add contributors.
