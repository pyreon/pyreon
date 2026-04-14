import { playwright } from '@vitest/browser-playwright'
import { defineBrowserConfig, tslibBrowserAlias } from '../../../vitest.browser'

// Why the tslib alias is required:
//   ECharts imports `__extends` (and other TypeScript helpers) from
//   `tslib`. tslib's `package.json` `exports` map points the `import`
//   condition at `./modules/index.js`, which does:
//
//     import tslib from '../tslib.js'
//     const { __extends, __assign, ... } = tslib
//     export { __extends, __assign, ... }
//
//   `tslib.js` is UMD/CJS; helpers live as TOP-LEVEL `var`s on the
//   factory exports, NOT as properties of `module.exports.default`.
//   Vite/esbuild's pre-bundler wraps the CJS via `__toESM(require_tslib())`,
//   the destructure tries to read `__extends` off `__toESM(...).default`,
//   gets `undefined`, and throws:
//
//     TypeError: Cannot destructure property '__extends' of
//     '__toESM(...).default' as it is undefined.
//
//   `tslib.es6.js` is a flat ESM module with proper named `export
//   function` declarations — sidesteps the broken `modules/index.js`
//   indirection entirely. The `tslibBrowserAlias()` helper from the
//   shared `vitest.browser.ts` resolves it across install layouts
//   (bun nested, npm/pnpm/yarn hoisted) and falls back to a no-op if
//   tslib isn't found.
//
//   This is a TEST-ENVIRONMENT fix only — Pyreon's published `lib/*.js`
//   ships with raw `import "echarts"` and consumer apps' bundlers
//   handle resolution. Apps using Vite hit the same bug; if a Pyreon
//   user reports it, the fix in their `vite.config.ts` is identical
//   to this file (alias `tslib` → `tslib.es6.js`).
//
//   Tracking upstream: microsoft/tslib#189.
export default defineBrowserConfig(playwright(), {
  resolve: {
    alias: { ...tslibBrowserAlias(import.meta.url) },
  },
})
