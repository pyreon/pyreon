---
'@pyreon/attrs': patch
'@pyreon/charts': patch
'@pyreon/cli': patch
'@pyreon/code': patch
'@pyreon/compiler': patch
'@pyreon/connector-document': patch
'@pyreon/coolgrid': patch
'@pyreon/core': patch
'@pyreon/create-zero': patch
'@pyreon/dnd': patch
'@pyreon/document': patch
'@pyreon/document-primitives': patch
'@pyreon/elements': patch
'@pyreon/feature': patch
'@pyreon/flow': patch
'@pyreon/form': patch
'@pyreon/head': patch
'@pyreon/hooks': patch
'@pyreon/hotkeys': patch
'@pyreon/i18n': patch
'@pyreon/kinetic': patch
'@pyreon/kinetic-presets': patch
'@pyreon/lint': patch
'@pyreon/machine': patch
'@pyreon/mcp': patch
'@pyreon/meta': patch
'@pyreon/permissions': patch
'@pyreon/preact-compat': patch
'@pyreon/query': patch
'@pyreon/reactivity': patch
'@pyreon/react-compat': patch
'@pyreon/rocketstyle': patch
'@pyreon/router': patch
'@pyreon/runtime-dom': patch
'@pyreon/runtime-server': patch
'@pyreon/rx': patch
'@pyreon/server': patch
'@pyreon/solid-compat': patch
'@pyreon/state-tree': patch
'@pyreon/storage': patch
'@pyreon/storybook': patch
'@pyreon/store': patch
'@pyreon/styler': patch
'@pyreon/svelte-compat': patch
'@pyreon/table': patch
'@pyreon/toast': patch
'@pyreon/typescript': patch
'@pyreon/ui-core': patch
'@pyreon/unistyle': patch
'@pyreon/url-state': patch
'@pyreon/validation': patch
'@pyreon/virtual': patch
'@pyreon/vite-plugin': patch
'@pyreon/vue-compat': patch
'@pyreon/zero': patch
'@pyreon/zero-cli': patch
---

Ship source maps in published tarballs.

Every `@pyreon/*` package now ships its `.js.map` and `.d.ts.map` files. The previous `!lib/**/*.map` exclusion in each package's `files` array left every emitted JS file pointing at a `//# sourceMappingURL=*.map` that wasn't actually published — causing Vite (and other bundlers) to log a "Failed to load source map" warning per file on every cold dev start. Real bug in shipped tarballs, not just dev-noise theory.

The fix is shipping the maps. They make framework stack traces readable: `at mountChild (node_modules/@pyreon/runtime-dom/src/nodes.ts:147)` instead of `at e (node_modules/@pyreon/runtime-dom/lib/index.js:1:42857)`. This matters most when a user hits a framework bug, opens devtools, or sees an unreadable production error from a server-side render. Sentry / Bugsnag / Rollbar can also translate framework frames using the shipped maps; without them, the framework's part of every captured stack stays opaque.

Cost: ~350KB-1MB per package in `node_modules`. Bundlers (Vite, Webpack, Rollup, esbuild) strip source maps from production builds automatically; they never reach end users. Every comparable library (React, Vue, Solid, Preact, Svelte, TanStack) does this.

No API changes. The `check-distribution` CI gate inverts to enforce the new contract (maps must be present, not absent).
