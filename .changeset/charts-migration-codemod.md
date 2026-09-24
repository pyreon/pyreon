---
'@pyreon/compiler': minor
---

New detector, `charts-legacy-import`, for code written against the `@pyreon/charts` 0.51 ECharts wrapper. `@pyreon/charts` 0.52 is Pyreon's own engine and the wrapper is removed, so `pyreon check` and the MCP `validate` tool now flag an import of a removed entry (`/manual`, `/vite`, `/webview`) or of the wrapper's names on the main entry (`useChart`, `connect`, `getCore`, the ECharts option types, and a `<Chart options>` render), with guidance on the engine shape to move to.

It is a diagnostic, not a rewrite: an ECharts option has no mechanical translation to marks, so `pyreon check --fix` and `migrate_pyreon` leave the code unchanged.

`diagnoseError` also recognises the errors an unmigrated app hits: the bundler's missing specifier for a removed entry and TypeScript's missing member. The detector-tag drift test now derives its code list from the `PyreonDiagnosticCode` union instead of a hand-kept copy that let a new code through.
