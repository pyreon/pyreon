---
"@pyreon/code": patch
---

Export `createTabbedEditor` from the package root + correct the `@pyreon/code` API docs.

- **Packaging fix**: `<TabbedEditor>` requires a `TabbedEditorInstance` (its `instance` prop), which is built by `createTabbedEditor` — but the factory was never re-exported from `@pyreon/code` (only the component + its types were). It's now importable: `import { createTabbedEditor } from '@pyreon/code'`.
- **Docs accuracy** (manifest feeding `llms.txt` / MCP `get_api`): `<TabbedEditor>` takes an `instance` prop (not `tabs`), each `Tab` uses `name` (not `label`), and `loadLanguage` returns `Promise<Extension>` (not `Promise<void>`), caches per language, and resolves to `[]` for uninstalled grammars. Added `createTabbedEditor` and `TabbedEditor` API-reference entries.
