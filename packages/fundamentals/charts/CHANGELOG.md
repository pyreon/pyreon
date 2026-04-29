# @pyreon/charts

## 1.0.0

### Minor Changes

- [#417](https://github.com/pyreon/pyreon/pull/417) [`a068104`](https://github.com/pyreon/pyreon/commit/a068104deb264e77bf432e725ff89b57ab1d4e91) Thanks [@vitbokisch](https://github.com/vitbokisch)! - New subpath export `@pyreon/charts/vite` ships `chartsViteAlias()` for consumer Vite configs. Resolves the recurring tslib bug that crashes any Vite-bundled app the moment ECharts loads (`TypeError: Cannot destructure property '__extends' of '__toESM(...).default' as it is undefined`) — tslib's `./modules/index.js` ESM entry destructures named helpers from a `__toESM(require_tslib())` default, but the helpers live as top-level vars on the CJS factory. Aliasing `tslib` → flat `tslib.es6.js` sidesteps the broken indirection. Usage:

  ```ts
  // vite.config.ts
  import { chartsViteAlias } from "@pyreon/charts/vite";
  export default defineConfig({
    resolve: { alias: { ...chartsViteAlias() } },
  });
  ```

  Returns `{}` when tslib can't be located (apps that don't actually use Charts won't break their config). Resolves via echarts itself first (covers Bun's nested layout), then walks up `node_modules` for hoisted layouts (npm/pnpm/yarn). Companion to the existing `tslibBrowserAlias()` from the test config — the two helpers exist because Vite config files run under Node's `node` condition (so they need a built `lib/vite.js` artifact) while vitest browser configs are loaded inside the test runner's bundler context.

  Tracking upstream: [microsoft/tslib#189](https://github.com/microsoft/tslib/issues/189).

### Patch Changes

- Updated dependencies [[`b8819ac`](https://github.com/pyreon/pyreon/commit/b8819ace413b377739e9208d19a72afbc0eea0c4)]:
  - @pyreon/core@1.0.0
  - @pyreon/reactivity@1.0.0

## 0.14.0

### Patch Changes

- Updated dependencies []:
  - @pyreon/core@0.14.0
  - @pyreon/reactivity@0.14.0

## 0.13.0

### Patch Changes

- Updated dependencies [[`a05c4ba`](https://github.com/pyreon/pyreon/commit/a05c4bab713f5168acd56eb233520102735bd80a)]:
  - @pyreon/core@0.13.0
  - @pyreon/reactivity@0.13.0

## 0.12.15

### Patch Changes

- Updated dependencies []:
  - @pyreon/core@0.12.15
  - @pyreon/reactivity@0.12.15

## 0.12.14

### Patch Changes

- Updated dependencies []:
  - @pyreon/core@0.12.14
  - @pyreon/reactivity@0.12.14

## 0.12.13

### Patch Changes

- Updated dependencies []:
  - @pyreon/core@0.12.13
  - @pyreon/reactivity@0.12.13

## 0.12.12

### Patch Changes

- Updated dependencies []:
  - @pyreon/core@0.12.12
  - @pyreon/reactivity@0.12.12

## 0.12.11

### Patch Changes

- Updated dependencies []:
  - @pyreon/core@0.12.11
  - @pyreon/reactivity@0.12.11

## 0.9.0

### Minor Changes

- ### Improvements
  - Upgrade to pyreon 0.7.5 (jsx preset, all JSX types accept undefined)
  - Use @pyreon/typescript preset (no local jsx override needed)
  - Complete documentation: 18 package READMEs, 18 docs/ files, llms.txt
  - Update AI building rules with document generation patterns

## 0.8.0

### Minor Changes

- [`075dd4f`](https://github.com/pyreon/fundamentals/commit/075dd4fe4a325fe5a5637a68e209dffe665bb84e) Thanks [@vitbokisch](https://github.com/vitbokisch)! - ### Improvements
  - Upgrade to TypeScript 6.0 and pyreon 0.7.3
  - Switch to @pyreon/typescript for tsconfig presets
  - Full exactOptionalPropertyTypes compliance
  - Security: add sanitization across all document renderers (XSS, XML injection, protocol validation)
  - Fix WebSocket.send() type for TS 6.0
  - Clean up conditional spreading now that core 0.7.3 accepts undefined on JSX attrs

## 0.7.0

### Minor Changes

- [`deb9834`](https://github.com/pyreon/fundamentals/commit/deb983456472cc685d80e97b21196588af53b502) Thanks [@vitbokisch](https://github.com/vitbokisch)! - ### New package

  - `@pyreon/document` — universal document rendering with 18 node primitives and 14 output formats (HTML, PDF, DOCX, XLSX, PPTX, email, Markdown, text, CSV, SVG, Slack, Teams, Discord, Telegram, Notion, Confluence/Jira, WhatsApp, Google Chat)

  ### Fixes

  - Fix DTS export paths — bump @vitus-labs/tools-rolldown to 1.15.4 (emitDtsOnly fix)
  - All packages now produce correct type declarations

## 0.6.0

### Minor Changes

- [`5610cdf`](https://github.com/pyreon/fundamentals/commit/5610cdffb69022aacd44419d7c71b97bdcf8403f) Thanks [@vitbokisch](https://github.com/vitbokisch)! - ### New packages

  - `@pyreon/flow` — reactive flow diagrams with signal-native nodes, edges, pan/zoom, auto-layout via elkjs
  - `@pyreon/code` — reactive code editor with CodeMirror 6, minimap, diff editor, lazy-loaded languages

  ### Improvements

  - Upgrade to pyreon 0.6.0
  - Use `provide()` for context providers (query, form, i18n, permissions)
  - Fix error message prefixes across packages

## 0.13.0

### Minor Changes

- Add @pyreon/permissions (reactive type-safe permissions) and @pyreon/machine (reactive state machines). Update AI building rules.

## 0.13.0

### Minor Changes

- Add @pyreon/storage (reactive localStorage, sessionStorage, cookies, IndexedDB) and @pyreon/hotkeys (keyboard shortcut management). Add useSubscription to @pyreon/query for WebSocket integration. Upgrade to pyreon core 0.5.4. Convert all tests and source to JSX.
