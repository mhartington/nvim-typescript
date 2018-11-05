#!/bin/sh

cd "$(dirname "$0")"
cd rplugin/node/nvim_typescript && npm install && npm run build
