---
'@pyreon/compiler': minor
'@pyreon/runtime-dom': minor
'@pyreon/vite-plugin': minor
---

Templatize COMPONENT children by default — the mixed shape now hydrates too

`templatizeComponentChildren` absorbs a component child into the enclosing
`_tpl()` template instead of bailing the whole element to `h()`. It is worth a
measured −13.0% on the 2,047-component deep-tree mount (41% of the gap to
Solid), and it has been opt-in because it cost hydration retention. It now
**defaults ON** in `@pyreon/vite-plugin`. The compiler primitive stays opt-in,
the same split `ssrTemplate` uses, because the emit injects an import.

Two things changed to make that safe.

**The mount hole no longer has to be the element's whole content.** A hole is
marker-free because it is TRAILING — the element's own closing tag supplies its
extent — and that never required the element to be EMPTY, only for the hole to
come last. So an element with static children followed by components is now
declared a hole that starts after them: the compiler bakes the static prefix as
usual, and the verifier matches those children first and starts the hole cursor
after them. How many there are is read off the template itself, so no count
crosses the compiler/runtime boundary to drift, and the all-components case is
the same code path with a count of zero. The shape this closes measured 3 of 4
nodes retained with the option OFF and 0 of 4 with it ON; it now retains 4 of 4.

**Shapes that cannot adopt are no longer absorbed at all.** The emitter takes
exactly `[element*][component+]` and bails everything else to `h()`, which is
byte-identically what it emits with the option off. The `<!>` + `_mountSlot`
form for components is gone: it rendered correctly, but produced a template
containing a comment, which the adopt verifier refuses — so it cost more
retention than the absorb bought. The result is that the option changes an emit
exactly when it absorbs, and there is no shape it makes worse.

Also fixes a latent interaction between this option and `collapseRocketstyle`.
Both rewrite the same node; collapse decided whether to wrap its call in JSX
braces from the node's AST parent, which is still a JSX element even after the
template pass has relocated that node's text into a call argument. The result
was `_mountChild({__rsCollapse(…)}, …)` — not parseable JavaScript. It needed
both features at once, so it was unreachable while this one was opt-in.

Set `templatizeComponentChildren: false` to restore the previous emit.
