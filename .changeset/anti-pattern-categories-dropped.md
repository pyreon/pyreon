---
'@pyreon/mcp': patch
---

`get_anti_patterns` was silently serving 64% of the catalog. Nine `##` sections of `anti-patterns.md` were absent from `CATEGORY_MAP`, and `parseAntiPatterns` skips an unmapped heading with a bare `continue` — so 86 of 236 entries never reached MCP consumers or the generated troubleshooting docs, including all 27 of `Build Pipeline Mistakes`, while the response header kept advertising a total. A second silent drop sat one level down: the title regex excluded literal asterisks, so a bullet titled with `` `node:*` `` was rejected outright. Both are fixed, all 236 entries are now served across 14 categories (7 new public troubleshooting pages), and a test asserts every catalog heading is mapped plus every bullet is parsed — so the next section added to the file fails a test instead of quietly shrinking the catalog.
