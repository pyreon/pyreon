---
'@pyreon/meta': minor
---

feat(meta): complete the barrel — re-export the 8 missing fundamentals + UI-system packages

`@pyreon/meta` advertised itself as "a barrel re-exporting the full Pyreon
ecosystem" but had quietly drifted: 7 published fundamentals and 1
UI-system surface were missing from `src/index.ts` despite being stable
and published. The `docs/docs/meta.md` description even named
`@pyreon/document` as included — a doc/code mismatch.

This PR closes that gap. Added named re-exports for:

- **`@pyreon/rx`** — `rx` namespace + types (37 functional ops; namespace
  form avoids `merge` / `throttle` / `debounce` collisions with other
  meta entries; tree-shakes individual operators).
- **`@pyreon/toast`** — `toast()`, `Toaster` + types.
- **`@pyreon/url-state`** — `useUrlState`, `setUrlRouter` + types.
- **`@pyreon/dnd`** — `useDraggable` / `useDroppable` / `useSortable` /
  `useFileDrop` / `useDragMonitor`.
- **`@pyreon/document`** — builder + `render` (skipped generic JSX names
  like `Text` / `List` / `Row` that would collide with elements/coolgrid).
- **`@pyreon/document-primitives`** — the 18 `Doc*` JSX primitives +
  `extractDocNode` / `createDocumentExport` / `documentTheme`.
- **`@pyreon/connector-document`** — `extractDocumentTree` / `resolveStyles`.
- **`@pyreon/ui-core`** — `PyreonUI` + `useMode` (the consumer-facing
  provider surface; framework-internal utilities like `init` / `compose` /
  `Provider` deliberately omitted to avoid generic-name collisions).

**Bundle hygiene (lazy by construction):** meta is `"sideEffects": false`
and every newly added source package is too — tree-shaking is end-to-end.
Heavy renderers stay lazy at the source: `@pyreon/document` lazy-loads
each format renderer (PDF/DOCX/XLSX/PPTX) inside `render(doc, '<format>')`
via dynamic `import()`; `@pyreon/charts`/`code`/`flow` do the same for
ECharts/CodeMirror grammars/elkjs. `import { … } from '@pyreon/meta'`
pulls only the reached subgraph — verified by `check-bundle-budgets`
(all 55 packages within budget post-change).

Test surface grows 105 → 149 (every new exported name asserted in
`src/tests/exports.test.ts`). Lint + typecheck clean. README + docs page
updated; docs description corrected to match what meta actually re-exports.
