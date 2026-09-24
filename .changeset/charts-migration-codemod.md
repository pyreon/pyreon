---
'@pyreon/compiler': minor
---

New fixable detector, `charts-legacy-import`. `pyreon check --fix` and the MCP `migrate_pyreon` tool now migrate code written against `@pyreon/charts` 0.51:

- old imports (`/plot`, `/manual`, `/vite`, and the ECharts wrapper's names on the main entry) are rewritten to the entry that now exports each name;
- `Plot` becomes `Chart`, `Tip` becomes `Tooltip`, and the wrapper's `Chart` becomes `EChart`, at every reference.

`diagnoseError` also recognises the two errors an unmigrated app hits: the bundler's missing `./plot` specifier and TypeScript's missing member. The detector-tag drift test now derives its code list from the `PyreonDiagnosticCode` union instead of a hand-kept copy that let a new code through.
