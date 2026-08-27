---
"@pyreon/document": patch
---

perf: PURE-form node brands so a subset import drops unused nodes (−68%)

The document node primitives (`Text`, `Heading`, `Table`, …) each did a bare
top-level `X._documentType = '…'` mutation. Because a bundler must run every
top-level side effect once ANY binding of the module is used, importing a SINGLE
node retained ALL 18 — the same bundle-pinning class fixed in `@pyreon/elements`
(#2418), through a brand property (`_documentType`) the `no-bare-component-brand`
gate did not scan.

Each node now brands on its export via `/* @__PURE__ */ Object.assign(fn, {
_documentType })` (same identity, `_documentType` still an own property read
identically by `extractDocumentTree`). Measured on the nodes module: a
`Text`-only import drops **1949 → 626 bytes (−68%)**; the full barrel grows
2996 → 3288 (+292, the accepted subset-vs-whole trade — most consumers use a
subset of node types). The gate now scans `_documentType` too (bisect-verified),
excluding manifest/api-reference doc-string examples.
