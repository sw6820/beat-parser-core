import typescript from '@rollup/plugin-typescript';
import { nodeResolve } from '@rollup/plugin-node-resolve';
import commonjs from '@rollup/plugin-commonjs';
import terser from '@rollup/plugin-terser';
import dts from 'rollup-plugin-dts';
import { readFileSync } from 'fs';

const pkg = JSON.parse(readFileSync('package.json', 'utf8'));

const banner = `/*!
 * ${pkg.name} v${pkg.version}
 * ${pkg.description}
 * ${pkg.homepage}
 * 
 * Copyright (c) ${new Date().getFullYear()} ${pkg.author}
 * Released under the ${pkg.license} license
 */`;

const input = 'src/index.ts';

const external = [
  ...Object.keys(pkg.dependencies || {}),
  ...Object.keys(pkg.peerDependencies || {}),
];

const plugins = [
  nodeResolve({
    preferBuiltins: true,
  }),
  commonjs(),
  typescript({
    tsconfig: './tsconfig.json',
    declaration: false,
    declarationMap: false,
    exclude: ['**/*.test.ts', '**/*.spec.ts', '**/test-setup.ts'],
  }),
];

const configs = [
  // CommonJS build
  {
    input,
    output: {
      file: pkg.main,
      format: 'cjs',
      banner,
      sourcemap: true,
      exports: 'named',
    },
    external,
    plugins,
  },
  
  // ESM build
  {
    input,
    output: {
      file: pkg.module,
      format: 'es',
      banner,
      sourcemap: true,
    },
    external,
    plugins,
  },
  
  // UMD build for browsers
  {
    input,
    output: {
      file: 'dist/index.umd.js',
      format: 'umd',
      name: 'BeatParser',
      banner,
      sourcemap: true,
    },
    plugins: [...plugins, terser()],
  },
  
  // UMD build for browsers (unminified)
  {
    input,
    output: {
      file: 'dist/index.umd.development.js',
      format: 'umd',
      name: 'BeatParser',
      banner,
      sourcemap: true,
    },
    plugins,
  },
  
  // Type definitions
  {
    input,
    output: {
      file: pkg.types,
      format: 'es',
    },
    plugins: [dts()],
  },
];

export default configs;