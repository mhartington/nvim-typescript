# neovim-client

| CI (Linux, macOS) | CI (Windows) | Coverage | npm | Gitter |
|-------------------|--------------|----------|-----|--------|
| [![Build Status Badge][]][Build Status] | [![Windows Build Status Badge][]][Windows Build Status] | [![Coverage Badge][]][Coverage Report] | [![npm version][]][npm package] | [![Gitter Badge][]][Gitter] |

Currently tested for node >= 8

## Installation
Install [node-host](https://github.com/neovim/node-host) using your vim plugin manager. Then install the `neovim` package globally using `npm`.

```sh
npm install -g neovim
```

## Usage
This package exports a single `attach()` function which takes a pair of
write/read streams and invokes a callback with a Nvim API object.

### `attach`

```js
const cp = require('child_process');
const attach = require('neovim').attach;

const nvim_proc = cp.spawn('nvim', ['-u', 'NONE', '-N', '--embed'], {});

// Attach to neovim process
(async function() {
  const nvim = await attach({ proc: nvim_proc });
  nvim.command('vsp');
  nvim.command('vsp');
  nvim.command('vsp');
  const windows = await nvim.windows;

  // expect(windows.length).toEqual(4);
  // expect(windows[0] instanceof nvim.Window).toEqual(true);
  // expect(windows[1] instanceof nvim.Window).toEqual(true);

  nvim.window = windows[2];
  const win = await nvim.window;

  // expect(win).not.toEqual(windows[0]);
  // expect(win).toEqual(windows[2]);

  const buf = await nvim.buffer;
  // expect(buf instanceof nvim.Buffer).toEqual(true);

  const lines = await buf.lines;
  // expect(lines).toEqual(['']);

  await buf.replace(['line1', 'line2'], 0);
  const newLines = await buf.lines;
  // expect(newLines).toEqual(['line1', 'line2']);

  nvim.quit();
  nvim_proc.disconnect();
})();
```

## Writing a Plugin
A plugin can either be a file or folder in the `rplugin/node` directory. If the plugin is a folder, the `main` script from `package.json` will be loaded.

### API (Work In Progress)
If you are a plugin developer, I'd love to hear your feedback on the plugin API.

The `neovim` package exports a few decorators, which means currently there's a dependency on `babel`.
The plugin host creates an instance of the plugin and creates a mapping of the handling method.

`console` has been replaced by a `winston` interface and `console.log` will call `winston.info`.

```javascript
import { Plugin, Function, AutoCommand, Command } from 'neovim';

// If `Plugin` decorator can be called with options
@Plugin({ dev: true })
export default class TestPlugin {
  /** nvim is set via host so below is unnecessary **/
  /*
  constructor(nvim) {
    this.nvim = nvim;
  }
  */

  @Function('Vsplit', { sync: true })
  splitMe(args, done) {
    this.nvim.command('vsplit');
  }

  @Command('LongCommand')
  async longCommand(args) {
    console.log('Output will be routed to $NVIM_NODE_LOG_FILE');
    const bufferName = await this.nvim.buffer.name;
    return bufferName;
  }

  @Command('UsePromises')
  promiseExample() {
    return this.nvim.buffer.name.then((name) => {
      console.log(`Current buffer name is ${name}`);
    });
  }
}
```

## Debugging / troubleshooting
Here are a few env vars you can set while starting `neovim`, that can help debugging and configuring logging:

#### `NVIM_NODE_HOST_DEBUG`
Will spawn the node process that calls `neovim-client-host` with `--inspect-brk` so you can have a debugger. Pair that with this [Node Inspector Manager Chrome plugin](https://chrome.google.com/webstore/detail/nodejs-v8-inspector-manag/gnhhdgbaldcilmgcpfddgdbkhjohddkj?hl=en)

### Logging
Logging is done using `winston` through the `logger` module. Plugins have `console` replaced with this interface.

#### `NVIM_NODE_LOG_LEVEL`
Sets the logging level for winston. Default is `debug`, available levels are `{ error: 0, warn: 1, info: 2, verbose: 3, debug: 4, silly: 5 }`

#### `NVIM_NODE_LOG_FILE`
Sets the log file path

### Usage through node REPL
#### `NVIM_LISTEN_ADDRESS`
First, start Nvim with a known address (or use the $NVIM_LISTEN_ADDRESS of a running instance):

$ NVIM_LISTEN_ADDRESS=/tmp/nvim nvim
In another terminal, connect a node REPL to Nvim

```javascript
let nvim;
// `scripts/nvim` will detect if `NVIM_LISTEN_ADDRESS` is set and use that unix socket
// Otherwise will create an embedded `nvim` instance
require('neovim/scripts/nvim').then((n) => nvim = n);

nvim.command('vsp');
```

The tests and `scripts` can be consulted for more examples.

## Contributors
* [@billyvg](https://github.com/billyvg) for rewrite
* [@mhartington](https://github.com/mhartington) for TypeScript rewrite
* [@fritzy](https://github.com/fritzy) for transferring over the npm package repo `neovim`!
* [@rhysd](https://github.com/rhysd), [@tarruda](https://github.com/tarruda), [@nhynes](https://github.com/nhynes) on work for the original `node-client`

[Build Status Badge]: https://travis-ci.org/neovim/node-client.svg?branch=master
[Build Status]: https://travis-ci.org/neovim/node-client
[Windows Build Status Badge]: https://ci.appveyor.com/api/projects/status/me5ru8ewx35shbq3?svg=true
[Windows Build Status]: https://ci.appveyor.com/project/rhysd/node-client
[Coverage Badge]: https://codecov.io/gh/neovim/node-client/branch/master/graph/badge.svg
[Coverage Report]: https://codecov.io/gh/neovim/node-client
[npm version]: https://img.shields.io/npm/v/neovim.svg
[npm package]: https://www.npmjs.com/package/neovim
[Gitter Badge]: https://badges.gitter.im/neovim/node-client.svg
[Gitter]: https://gitter.im/neovim/node-client?utm_source=badge&utm_medium=badge&utm_campaign=pr-badge
