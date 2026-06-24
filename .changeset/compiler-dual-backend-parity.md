---
'@pyreon/compiler': patch
---

Fix Rust-backend JSX-compiler divergences from the JS oracle, found via a 644-file real-corpus dual-backend byte-diff sweep:

- **Text-vs-vnode child classifier made generic (whole-class fix).** The JS oracle classifies a JSX child as a vnode (`_mountSlot`) vs text (`_bind .data`) via a generic walk over every descendant node; the Rust `contains_jsx_in_expr` was a hand-rolled partial mirror that missed nested-JSX shapes and rendered `[object Object]` — `obj?.map(x => <jsx/>)` (JSX in an optional-chained call's args) and IIFEs `(() => { … return <jsx/> })()` (JSX in the call callee). Both were the same class, so rather than patch shapes one at a time the classifier now uses an `oxc_ast_visit::Visit` walker that matches the JS oracle by construction (both visit every node), eliminating the entire class including shapes not in the corpus.
- **`.map`/any-CallExpression-argument callback params** were over-bound as reactive props: a bare item read like `{item.label}` in a compiled element emitted a wasteful per-row `_bind()` renderEffect instead of static `textContent`, because the item-param carve-out only covered direct JSX-child render callbacks, not nested `.map`-arg callbacks.

Both backends are now byte-identical for these shapes, locked by `corpus-sweep regressions` fixtures in `native-equivalence.test.ts` (bisect-verified).
