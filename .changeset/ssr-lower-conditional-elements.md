---
"@pyreon/compiler": patch
---

perf(compiler,ssr): lower conditional DOM elements to `_ssr` in the compile-to-string SSR path

A page-structure conditional — `{cond && <el>}` or `{cond ? <el> : <el|null>}` —
previously left its branch element as raw JSX inside the `_esc`/`_escSole` hole,
so the TAKEN branch allocated a VNode and walked `renderNode` on every request.
The eligible DOM-element operand is now lowered to a nested `_ssr(...)` string
build (the same treatment `.map` items already get via `_ssrChildren`), so the
taken branch concatenates a string instead — the proven `ssrTemplate` mechanism
extended to conditionals.

Byte-identical to the h() path for every value: the `&&`/`?:` short-circuit is
untouched (only an element operand's value changes VNode→RawHtml), each lowered
element satisfies the `_ssr(el) ≡ renderNode(<el>)` invariant, and the runtime
`_esc`/`_escSole` route a RawHtml through `renderNode` exactly as a VNode. The
`sole`/`shouldWrap` marker decision reads the original expression and is
unchanged. Only DOM elements with no component (preserved) children are lowered;
component-child branches, non-element operands, and `.map`/`<For>` item bodies
(mapitem/foritem mode) keep the VNode path — the last is a scoped follow-up.

Both compiler backends emit byte-identically (locked by native-equivalence);
SSR↔h() parity is fuzz-locked at 20,000 seeds. Measured ~1.65× faster
renderToString on a 40-conditional-element page (5.7µs vs 9.4µs, byte-identical
output, load 4.7, 6 interleaved passes).
