---
"@pyreon/compiler": patch
"@pyreon/mcp": patch
---

docs(compiler): source-verified `mistakes[]` foot-gun catalogs added to
transformJSX_JS, diagnoseError, and deriveIslandName (+ one more on transformJSX);
mistakes[] blocks 4 → 8. Every footgun verified against the worktree source:
diagnoseError must be imported from the browser-safe `@pyreon/compiler/diagnose`
subpath for client use (the main barrel transitively `import ts from "typescript"`
via the AST detectors, dragging the TS compiler API into the browser bundle —
confirmed index.ts re-exports it AND react-intercept/pyreon-intercept/ts.ts all
import typescript); transformJSX_JS is the slow fallback with byte-identical output
(not a lighter pass); deriveIslandName's fnv1a6 diverges if relPath isn't the
`islandRelPath` normalization; transformJSX output isn't standalone (needs the
Pyreon runtime helpers). Regenerates the MCP api-reference compiler region.
Docs/manifest only — no runtime behavior change.
