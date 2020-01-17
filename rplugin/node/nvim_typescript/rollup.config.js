import typescript from 'rollup-plugin-typescript';
import pkg from './package.json';
import { terser } from 'rollup-plugin-terser';
import resolve from 'rollup-plugin-node-resolve';
export default {
  input: 'src/index.ts',
  plugins: [
    resolve(),
    typescript(),
    terser({
      sourcemap: true,
      output: { comments: false },
      compress: {
        keep_infinity: true,
        pure_getters: true,
        passes: 10
      },
      ecma: 5,
      warnings: true
    })
  ],
  external: [
    'fs',
    'child_process',
    'neovim',
    'tmp',
    'path',
    'events',
    'os',
    'readline'
  ],
  output: [
    { file: pkg.main, format: 'cjs' },
    { file: pkg.module, format: 'esm' }
  ]
};
