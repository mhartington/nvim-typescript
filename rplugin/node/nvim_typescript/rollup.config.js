import { nodeResolve } from '@rollup/plugin-node-resolve';
import typescript from '@rollup/plugin-typescript';
import { terser } from 'rollup-plugin-terser';

import pkg from './package.json';

export default {
  input: 'src/index.ts',
  external: [
    'fs',
    'child_process',
    '@neovim/decorators',
    'tmp',
    'path',
    'events',
    'os',
    'readline',
  ],
  output: [
    { file: pkg.main, format: 'cjs' },
    { file: pkg.module, format: 'esm' },
  ],
  plugins: [
    typescript(),
    nodeResolve(),
    terser({
      output: { comments: false },
      compress: {
        keep_infinity: true,
        pure_getters: true,
        passes: 10,
      },
      ecma: 5,
      warnings: true,
    }),
  ],
};
