---
"@pyreon/compiler": patch
"@pyreon/head": patch
"@pyreon/primitives": patch
"@pyreon/router": patch
"@pyreon/runtime-dom": patch
"@pyreon/a11y": patch
"@pyreon/code": patch
"@pyreon/dnd": patch
"@pyreon/document": patch
"@pyreon/feature": patch
"@pyreon/flow": patch
"@pyreon/form": patch
"@pyreon/hotkeys": patch
"@pyreon/http": patch
"@pyreon/i18n": patch
"@pyreon/machine": patch
"@pyreon/permissions": patch
"@pyreon/query": patch
"@pyreon/rich-text": patch
"@pyreon/state-tree": patch
"@pyreon/storage": patch
"@pyreon/store": patch
"@pyreon/sync": patch
"@pyreon/table": patch
"@pyreon/toast": patch
"@pyreon/url-state": patch
"@pyreon/validation": patch
"@pyreon/virtual": patch
"@pyreon/native-compiler": patch
"@pyreon/atlas": patch
"@pyreon/lint": patch
"@pyreon/loom": patch
"@pyreon/mcp": patch
"@pyreon/preact-compat": patch
"@pyreon/react-compat": patch
"@pyreon/solid-compat": patch
"@pyreon/svelte-compat": patch
"@pyreon/testing": patch
"@pyreon/vite-plugin": patch
"@pyreon/vue-compat": patch
"@pyreon/kinetic": patch
"@pyreon/zero-cli": patch
"@pyreon/zero-content": patch
"@pyreon/zero": patch
---

Update external dependencies to latest across the workspace: tanstack query/virtual patches, tiptap 3.29.2, codemirror view 6.43.8, shiki 4.4.2, elkjs 0.12, yjs 13.6.32, MCP SDK 1.30, oxc 0.143, magic-string 1.1.0, pragmatic-drag-and-drop 2.0.2, and tooling (vite 8.2.0, playwright 1.62.1 — both previously held back by upstream bugs now fixed). `@pyreon/testing` widens its `@testing-library/jest-dom` peer to `^6.0.0 || ^7.0.0` (v7 verified). TypeScript stays capped `<7.0.0` (TS7 removed the classic Compiler API); `@tanstack/table-core` stays on v8 (v9 is a structural API rewrite that would break `@pyreon/table`'s public options surface — tracked as its own migration).
