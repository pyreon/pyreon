---
"@pyreon/a11y": patch
"@pyreon/atlas": patch
"@pyreon/attrs": patch
"@pyreon/auth": patch
"@pyreon/charts": patch
"@pyreon/cli": patch
"@pyreon/code": patch
"@pyreon/compiler": patch
"@pyreon/compiler-darwin-arm64": patch
"@pyreon/compiler-darwin-x64": patch
"@pyreon/compiler-linux-arm64-gnu": patch
"@pyreon/compiler-linux-arm64-musl": patch
"@pyreon/compiler-linux-x64-gnu": patch
"@pyreon/compiler-linux-x64-musl": patch
"@pyreon/compiler-win32-x64-msvc": patch
"@pyreon/config": patch
"@pyreon/connector-document": patch
"@pyreon/coolgrid": patch
"@pyreon/core": patch
"@pyreon/create-multiplatform": patch
"@pyreon/create-zero": patch
"@pyreon/dnd": patch
"@pyreon/document": patch
"@pyreon/document-primitives": patch
"@pyreon/elements": patch
"@pyreon/feature": patch
"@pyreon/flow": patch
"@pyreon/form": patch
"@pyreon/head": patch
"@pyreon/hooks": patch
"@pyreon/hotkeys": patch
"@pyreon/http": patch
"@pyreon/i18n": patch
"@pyreon/kinetic": patch
"@pyreon/kinetic-presets": patch
"@pyreon/lathe": patch
"@pyreon/lint": patch
"@pyreon/loom": patch
"@pyreon/machine": patch
"@pyreon/mcp": patch
"@pyreon/meta": minor
"@pyreon/native-cli": patch
"@pyreon/native-compiler": patch
"@pyreon/native-router-kotlin": patch
"@pyreon/native-router-swift": patch
"@pyreon/native-runtime-kotlin": patch
"@pyreon/native-runtime-swift": patch
"@pyreon/permissions": patch
"@pyreon/preact-compat": patch
"@pyreon/primitives": patch
"@pyreon/query": patch
"@pyreon/react-compat": patch
"@pyreon/reactivity": patch
"@pyreon/rich-text": patch
"@pyreon/rocketstyle": patch
"@pyreon/router": patch
"@pyreon/runtime-dom": patch
"@pyreon/runtime-server": patch
"@pyreon/rx": patch
"@pyreon/server": patch
"@pyreon/sized-map": patch
"@pyreon/solid-compat": patch
"@pyreon/state-tree": patch
"@pyreon/storage": patch
"@pyreon/store": patch
"@pyreon/storybook": patch
"@pyreon/styler": patch
"@pyreon/svelte-compat": patch
"@pyreon/sync": patch
"@pyreon/table": patch
"@pyreon/testing": patch
"@pyreon/toast": patch
"@pyreon/typescript": patch
"@pyreon/ui-core": patch
"@pyreon/unistyle": patch
"@pyreon/url-state": patch
"@pyreon/validate": patch
"@pyreon/validation": patch
"@pyreon/virtual": patch
"@pyreon/vite-plugin": patch
"@pyreon/vue-compat": patch
"@pyreon/zero": patch
"@pyreon/zero-cli": patch
"@pyreon/zero-content": patch
---

Every published package now declares its tier in `package.json`: `"pyreon": { "stability": "stable" | "experimental", "experimentalSubpaths"?: [...] }`. From 1.0 the semver promise covers Stable packages only; Experimental packages, and the experimental subpaths of Stable packages (every `./native-plugin`, `@pyreon/core/plain`, `@pyreon/compiler/audits` and `/plain`, `@pyreon/charts/engine`, and the `./webview` subpaths of code, flow and rich-text), may break in a minor release. Each README opens with a status line generated from the field. The policy, including the compiler-helper ABI rule and deprecations, is at https://pyreon.dev/docs/stability-and-direction.

The `@pyreon/http` and `@pyreon/loom` READMEs no longer claim the packages are unpublished.

**Breaking (`@pyreon/meta`):** the barrel no longer re-exports `@pyreon/document-primitives` (the `Doc*` components, `createDocumentExport`, `documentTheme`, `extractDocNode`, `DocumentPreview`) or `@pyreon/connector-document` (`extractDocumentTree`, `resolveStyles`), because both are Experimental and meta is Stable. Upgrade: install those packages and import from them directly.

The ui-core, unistyle, rocketstyle, coolgrid and elements manifests no longer claim that the low-level `Provider` logs a dev warning; it has not warned for some time.
