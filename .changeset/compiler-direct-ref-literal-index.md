---
'@pyreon/compiler': patch
---

Signal reads through a literal index or a TypeScript type layer now get the direct binding tier. `{row.queries[0].elapsed()}`, `{(row.cell as Cell).elapsed()}` and `{row.cell!.elapsed()}` used to compile to a fully tracked binding (one effect re-run per update) instead of `_bindText` / `_bindDirect`. A literal key is as stable as a named property and a cast is erased at runtime, so both now bind the signal directly. A dynamic index (`row.queries[i]`) still takes the general path. Measured on the dbmon benchmark (600 cells updating per tick): Pyreon goes from about 1.09× behind Svelte to a statistical tie.
