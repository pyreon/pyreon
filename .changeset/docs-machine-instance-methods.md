---
"@pyreon/machine": patch
"@pyreon/mcp": patch
---

docs(machine): document the instance query + control surface. The manifest was
already excellent (dense summaries + 5 gotchas), but four reactive public methods
were only mentioned in passing — now a grouped api[] entry: `matches(...states)`
(variadic OR), `nextEvents()` (declared `on` keys — NOT guard-filtered, excludes
`always`, verified machine.ts:182), `reset()` (initial + its `always` cascade),
`dispose()` (clears all listeners; the machine still transitions afterward). Each
carries a source-verified foot-gun. Regenerates the MCP api-reference machine
region + snapshot test (entry count 4 → 5). Docs/manifest only — no runtime change.
