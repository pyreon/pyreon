---
"@pyreon/rocketstyle": patch
"@pyreon/mcp": patch
---

docs(rocketstyle): document the `context` export. The rocketstyle manifest was
already excellent (13 mistakes blocks + 5 gotchas covering useBooleans-false,
_rsMemo cache-key-post-normalization, component-swap chain reset, layout/CSS
split, introspection surface — all flagship entries verified accurate, no doc
bug). The one gap was the `context` public export (mentioned in Provider's summary
but not its own api[] entry). Documented it: the raw reactive context re-exported
from `@pyreon/ui-core` (the SAME object `<PyreonUI>`/Provider write), whose
`useContext(context)` returns a `() => { theme, mode, isDark, isLight }` accessor.
Verified against context/context.ts. Regenerates the MCP api-reference rocketstyle
region + snapshot (count 13 → 14). Docs/manifest only — no runtime behavior change.
