---
"@pyreon/charts": minor
---

New subpath export `@pyreon/charts/vite` ships `chartsViteAlias()` for consumer Vite configs. Resolves the recurring tslib bug that crashes any Vite-bundled app the moment ECharts loads (`TypeError: Cannot destructure property '__extends' of '__toESM(...).default' as it is undefined`) — tslib's `./modules/index.js` ESM entry destructures named helpers from a `__toESM(require_tslib())` default, but the helpers live as top-level vars on the CJS factory. Aliasing `tslib` → flat `tslib.es6.js` sidesteps the broken indirection. Usage:

```ts
// vite.config.ts
import { chartsViteAlias } from '@pyreon/charts/vite'
export default defineConfig({
  resolve: { alias: { ...chartsViteAlias() } },
})
```

Returns `{}` when tslib can't be located (apps that don't actually use Charts won't break their config). Resolves via echarts itself first (covers Bun's nested layout), then walks up `node_modules` for hoisted layouts (npm/pnpm/yarn). Companion to the existing `tslibBrowserAlias()` from the test config — the two helpers exist because Vite config files run under Node's `node` condition (so they need a built `lib/vite.js` artifact) while vitest browser configs are loaded inside the test runner's bundler context.

Tracking upstream: [microsoft/tslib#189](https://github.com/microsoft/tslib/issues/189).
