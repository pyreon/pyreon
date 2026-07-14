---
"@pyreon/document-primitives": patch
"@pyreon/mcp": patch
---

docs(document-primitives): source-verified `mistakes[]` foot-gun catalogs added to
the flagship components that had none — DocDocument (3), DocTable (2), DocList (2);
mistakes[] blocks 1 → 4. Every footgun verified against the worktree source:
DocDocument stores title/author/subject accessors in `_documentProps` and the
`.attrs()` callback runs ONCE at mount, so a called accessor (`title={getTitle()}`)
captures once while a plain string is static and null is omitted; DocTable rows are
keyed by `column.key` and columns/rows are `_documentProps`-only (filtered before
the DOM because `HTMLTableElement.rows` is read-only); DocList's `ordered` sets the
tag while DocListItem carries no marker (`_documentProps: {}`). Regenerates the MCP
api-reference document-primitives region. Docs/manifest only — no runtime change.
