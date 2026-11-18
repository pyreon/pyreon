---
'@pyreon/compiler': patch
---

`formatReactivityLens` (and so MCP `explain_reactivity`) names each finding once. It printed the kind badge in front of a detail that already starts with the kind, so every line read `◆ live — live — …` or `○ baked once — baked once into the DOM — …`. Structural findings now get only the glyph (`◆ live — this text re-renders…`). Footguns keep `⚠ footgun [code] — …`. The finding `detail` strings, which the LSP tooltips use, are unchanged.
