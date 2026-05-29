import { nodeResolve } from '@rollup/plugin-node-resolve'

const plugins = [nodeResolve({ browser: true })]

export default [
  {
    input: 'index.js',
    plugins,
    output: {
      file: 'dist/money-clip.js',
      format: 'cjs',
      exports: 'named',
    },
  },
  {
    input: 'index.js',
    plugins,
    output: {
      file: 'dist/money-clip.m.js',
      format: 'es',
    },
  },
  {
    input: 'index.js',
    plugins,
    output: {
      file: 'dist/money-clip.umd.js',
      format: 'umd',
      name: 'moneyClip',
      exports: 'named',
    },
  },
  {
    input: 'index.js',
    plugins,
    output: {
      file: 'dist/money-clip.modern.js',
      format: 'es',
    },
  },
]
