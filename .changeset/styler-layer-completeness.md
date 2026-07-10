---
'@pyreon/styler': patch
---

`insertGlobal` CSS rule splitting/flattening — four silent-drop classes closed (the 0.41.x `@layer` fixes covered top-level sibling + nested blocks only; a fresh-DOM stress audit proved these remained). Before/after per shape:

1. **`@layer` inside a group rule** (`@media (min-width:600px){ @layer x { .a{color:red} } }`, flatten path): before — the flattener didn't descend into `@media`/`@supports`/`@container`, insertRule succeeded with an EMPTY group body and `.a` was lost with ZERO warn; after — layer blocks inside group rules unwrap while the group wrapper is preserved (`@media X{@layer y{R}}` → `@media X{R}`).
2. **`@layer a, b;` ordering STATEMENT — broken on EVERY path, modern browsers included**: before — the brace-counting splitter only emitted brace-terminated slices, so the statement (and `@import …;`/`@namespace …;`) vanished even on `@layer`-supporting engines, silently corrupting the user's declared cascade order (locked by a real-Chromium spec: with the statement swallowed, source order won — red instead of green); after — depth-0 semicolon-terminated at-statements are emitted as their own rules and insert natively on the supported path. On the flatten path an ordering statement is meaningless once flattened — it is dropped WITH a dev warning naming the cascade-order loss.
3. **String/comment/url-unaware brace counting**: before — `.a{background:url("a}b.png");content:"}"}` split mid-string, both declarations were lost AND the poisoned (negative) depth counter silently ate following sibling rules; after — the splitter is a string-aware state machine (`"…"`/`'…'` incl. backslash escapes, `/* … */` comments, unquoted `url(…)` tokens) and rules survive intact (real-Chromium computed-style locks).
4. **Anonymous `@layer { … }` blocks + unbalanced input**: before — anonymous blocks (valid CSS) weren't unwrapped (the regex required a name), and unbalanced input (`@layer a{.x{`) dropped everything from the unclosed rule on with zero signal; after — the block regex takes an optional name, and a dev warning names the dropped unparseable tail.

Honest caveat now documented in code + README + docs instead of an over-confident comment: the `@layer`-unsupported flatten fallback CHANGES cascade semantics (flattened rules become unlayered, which inverts "unlayered beats layered"; ordering statements are lost) — it is a least-bad fallback that lands the content, not an `@layer` emulation.

Known adjacent gap (disclosed, not fixed here): `splitAtRules` on the scoped `insert()` component path still counts braces naively — a `}` inside a string in component CSS that ALSO contains a nested `@media`/`@supports`/`@container` block can still mis-split; follow-up planned.
