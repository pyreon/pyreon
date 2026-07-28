---
'@pyreon/compiler': patch
---

Stop bailing the SSR compile-to-string fast path on nested self-closing / void elements.

`ssrSerializeElement` bailed on any self-closing element — a bail commented "rare", but `<img/>`, `<input/>`, `<br/>` and `<hr/>` are in most real markup, and the bail **propagates**: one `<img/>` dropped its whole enclosing component onto the slow `h()` path. Only void-free SIBLING subtrees were salvaged into their own `_ssr(...)`, which is why a substring check for `_ssr(` false-positives on this shape and hid the loss.

Both forms serialize trivially, so they are now handled inline:

- a **void** tag closes as `` ` />` `` — byte-identical to the runtime's `enqueue(`${open} />`)`; the space is load-bearing, any other spelling is a hydration-visible divergence
- a **self-closing non-void** tag (`<div />`) emits `<div></div>`, matching the `h()` path

A void tag written WITH an explicit children list (`<img>x</img>`) still bails deliberately — the runtime drops those children, so guessing which side to match would be wrong.

Measured on a 9-shape corpus of realistic markup: **0/9 → 8/9 on the fast path**, byte-identity preserved in both states. Mirrored in the Rust backend; `native-equivalence` and the 300-seed × 3-mode differential fuzz are green. Root-level self-closing elements still bail (that gate is untouched) — only the propagating nested case was widened.
