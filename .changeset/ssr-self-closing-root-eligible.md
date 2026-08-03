---
"@pyreon/compiler": patch
---

perf(ssr): root self-closing elements are eligible for the compile-to-string fast path

A component whose own body is a self-closing element — `<Icon> = () => <img …/>`, `<Divider> = () => <hr/>`, `<Input> = () => <input …/>`, `<Spacer> = () => <br/>`, or a bare `<div class="box" />` — fell to the slow `h()` SSR path. #2515 widened the NESTED case (a `<img/>` inside a parent no longer drops its whole enclosing component) but deliberately left the ROOT gate in place; this closes it, plus the `.map` and `<For>` item-body gates, so `items.map(i => <img src={i.src}/>)` (an image gallery) no longer bails the whole list.

These are the small leaf components a design system renders most often, and the ones most likely to appear inside a list — so the bail was multiplying across a page. The repo's own measurement of where SSR headroom remains points here: the `h()`-path self-time floor is structural (VNode allocation inherent to `h()`), so widening `_ssr` ELIGIBILITY is the lever, not micro-optimising `h()`.

Semantics were already implemented — `ssrSerializeElement` has emitted both forms correctly since #2515 (void → `<img … />` with the load-bearing space, non-void → `<div …></div>`). Only the gates were left closed. Landed in BOTH backends; the native binary is what ~80% of users compile with, so a JS-only fix would have changed nothing for them.

Also fixes a latent JS-backend bug this surfaced: `buildSsrForItemBody` requested the `_ssrItem` import unconditionally while only emitting the `_ssrItem` fallback when a hole was not provably a string, shipping a DEAD import on the no-guard branch. The native backend never had it. Self-closing item bodies made it visible because they carry attr holes (all `: string`-typed helpers) and no text children, so they take the no-guard branch essentially every time.

Byte-identity against the `h()` path is locked per shape in `ssr-template-differential`, exact emitted bytes in `ssr-template-emit`, and JS↔Rust equality in `native-equivalence`. A void element given explicit children still bails — that one is genuinely ambiguous.
