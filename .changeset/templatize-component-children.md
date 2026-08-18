---
'@pyreon/compiler': minor
'@pyreon/runtime-dom': minor
'@pyreon/vite-plugin': minor
---

Add `templatizeComponentChildren` — absorb COMPONENT children into the enclosing
`_tpl()` template instead of bailing the whole element to `h()`. **Opt-in,
default off.**

The template emitter bails on a component child, so one `<Node/>` makes
`templateElementCount` return −1 for that element and every ancestor — an app's
whole composition skeleton lowers to `h()` + `mountElement`. With the option on,
the skeleton bakes into the template HTML and each component child is mounted
into the clone: `_mountChild` appended when nothing static follows it (no
placeholder comment), `_mountSlot` + a `<!>` placeholder otherwise.

Measured on the 2,047-component deep-tree mount — production builds, real
Chromium, three interleaved passes, arms verified by grepping the built bundle
for the baked `<div class="branch"></div>` template before reading any number:
**4.53ms → 3.94ms (−13.0%)**, with Vanilla/Solid/React/Vue/Svelte as in-run
controls all moving ≤2% except two noisier arms at ≤5.5%. The gap to SolidJS
closes 1.31ms → 0.77ms, i.e. **41% of the remaining deep-tree deficit**;
standing 1.41× → 1.24×.

Ordering is safe by construction. A `_tpl` bind runs when the CALL EXPRESSION
evaluates, so a bind that MOUNTS COMPONENTS is ordered against the enclosing
component's setup. A component's sole child is `_lc`-deferred, and every other
eager-argument position (multi-child component parent, member/namespaced tag
parent, fragment, expression container) bails to `h()`.

**Why it stays off by default:** a `_tpl` result is SWAPPED at hydration, so
every element this newly templatizes stops adopting its SSR DOM — and so does
everything below it. Measured on a 3-level layout, node retention 4/4 → 0/4 (it pinned 3/4 when written; #2918 then taught hydration to ADOPT compiled templates, so the OFF arm now keeps all four).
Only enable it for a client bundle that never calls `hydrateRoot()`. The plugin
warns once when it is on, because it also forces the compiler's JS backend (no
native mirror yet).
