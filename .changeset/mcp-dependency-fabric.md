---
'@pyreon/mcp': minor
---

New MCP tool: `get_dependency_fabric` — serves the workspace dependency graph
`loom scan` writes to `loom-report.json`.

Atlas had two MCP tools; loom had none. An assistant could ask what components
exist and what props they take, but not what the packages are, what depends on
what, or what is wrong with the fabric — so "is it safe to change this?" got
answered from a `package.json` read at best, when a machine-readable graph with
blast-radius ranking was sitting on disk unread.

Call it with no arguments for the overview (shape, runtime cycles, gating
findings, the packages whose change reaches the most others); pass `package`
for one package's runtime deps, dependents, depth, reach and findings.

Reads the artifact rather than importing `@pyreon/loom`, matching `atlas.ts`
and for one more reason: loom's scan walks every file in the workspace, so
re-running it per tool call would make every question pay for a full scan.
A missing report returns instructions to run `loom scan`; a corrupt one is
named as unreadable rather than rendered as an empty fabric; a report older
than a day is flagged with its age.

Loom's honesty rule travels with the data: DECLARED truth only — no lockfile,
no registry, so it cannot say what is INSTALLED — and `unused-dep` is lexical
evidence, not proof. An agent that reads "unused" as "safe to delete" will
delete a package a bin loads at runtime.

Also corrects `index.ts`'s header roster, which claims to enumerate every tool
and had been missing `get_atlas_catalog` and `get_atlas_component` since they
landed.
