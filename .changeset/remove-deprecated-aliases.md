---
"@pyreon/runtime-dom": minor
"@pyreon/document-primitives": minor
"@pyreon/meta": minor
"@pyreon/state-tree": patch
---

Remove deprecated aliases: `@pyreon/runtime-dom`'s `render` (an alias of `mount`), and `@pyreon/document-primitives`'s `createDocumentExport` plus its `DocumentExport` type (a wrapper around `extractDocNode`). `@pyreon/meta` drops its re-exports of both. In state-tree, an unreachable `ModelConfig` type alias is deleted. No public entry exported it.

Migration: `render(app, el)` → `mount(app, el)`; `createDocumentExport(fn).getDocNode()` → `extractDocNode(fn)` (same options argument).
