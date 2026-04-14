import { playwright } from '@vitest/browser-playwright'
import { createRequire } from 'node:module'
import path from 'node:path'
import { mergeConfig } from 'vite'
import { defineBrowserConfig } from '../../../vitest.browser'

// Alias `tslib` to its true-ESM file (`tslib.es6.js`) so echarts's
// `import { __extends } from "tslib"` picks up named exports directly.
//
// Why this is needed: tslib ships THREE entries in package.json
// `exports`:
//   - `module`:  ./tslib.es6.js   (proper ESM with named exports)
//   - `import`:  ./modules/index.js  ← THIS IS BROKEN
//   - `default`: ./tslib.js         (UMD/CJS, helpers as global vars)
//
// `./modules/index.js` does `import tslib from '../tslib.js'` then
// destructures named helpers from `tslib.default`. When esbuild's
// pre-bundler (used by Vite under @vitest/browser) wraps tslib.js
// with `__toESM(require_tslib())`, the destructure throws:
//
//   "Cannot destructure property '__extends' of '__toESM(...).default'
//    as it is undefined"
//
// because tslib.js's UMD shape exposes helpers as TOP-LEVEL vars on
// the factory exports, NOT as properties of the wrapped default.
//
// `tslib.es6.js` sidesteps the entire issue — it's a flat ESM module
// with `export function __extends(...)`. Aliasing `tslib` to it makes
// echarts's named imports resolve cleanly. The `module` condition
// would normally pick this entry, but Vite's resolver under vitest
// browser mode + the `bun` workspace condition lands on `default`
// (CJS) instead. Explicit alias is the most robust fix.
//
// Tracking upstream: https://github.com/microsoft/tslib/issues/189
// tslib isn't a direct dep of this package, so resolve it via echarts
// (which IS a direct dep and lists tslib as a required peer).
const require = createRequire(import.meta.url)
const echartsDir = path.dirname(require.resolve('echarts/package.json'))
const tslibEsm = path.resolve(echartsDir, '../tslib/tslib.es6.js')

export default mergeConfig(defineBrowserConfig(playwright()), {
  resolve: {
    alias: { tslib: tslibEsm },
  },
})
