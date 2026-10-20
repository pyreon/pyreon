---
'@pyreon/runtime-server': minor
'@pyreon/runtime-dom': patch
'@pyreon/compiler': patch
'@pyreon/mcp': patch
---

`<For>` SSR output is now about half as many DOM nodes for a typical list. A leading run of single-element rows (a table body, a list) no longer gets a `<!--k:KEY-->` comment before every row. Their keys travel once, space-separated, on the closing marker instead: `<!--/pyreon-for:k0 k1 …-->`. From the first row of any other shape (a component, fragment, accessor or text), every row keeps its own marker as before, because those rows can span any number of nodes.

The string renderer, the stream renderer and the compiled `_ssrForKeyed` fast path emit identical bytes. Hydration rebuilds the row table from both forms and still verifies every key before adopting anything. A list whose keys don't match is re-rendered, exactly as before. The previous format (a marker before every row) still hydrates, so a cached prerendered page keeps working after an upgrade.

Measured on the 1,000-row hydration benchmark (real Chromium, n=60, the same session for both arms): Pyreon goes from 6.33 ms (a tie with Vue at 6.26 ms) to 6.11 ms, an outright first place (Vue 6.31 ms, CIs disjoint). The framework walk drops from 1.31 ms to 1.17 ms, and the browser's layout flush gets cheaper with fewer nodes to lay out. The HTML is smaller too.

The server and client halves must be the same version. Every app already ships both from one build, and `@pyreon/*` releases as a fixed version group.

The `runtime-server.for.keyMarker` dev counter now counts only rows that get their own marker, so it reads 0 for a plain table.
