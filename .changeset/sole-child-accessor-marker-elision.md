---
'@pyreon/runtime-server': patch
'@pyreon/runtime-dom': patch
'@pyreon/compiler': patch
---

Sole-child accessor slots are SSR-emitted without `<!--$-->…<!--/$-->` range markers.

SSR wraps every reactive accessor's output in range markers because an accessor's DOM extent is runtime-unknowable — it can render zero nodes, one, or many. There is exactly one construct where it is knowable: an accessor that is its element's ONLY child, where the tag boundary already delimits the slot. Everything between `<a>` and `</a>` IS the extent, whatever the value. Those markers carried no information, so they are gone: 18 bytes of HTML per slot and, on hydration, a whole per-row DOM triplet locate-verify-remove replaced by a single node check.

The elision is decided from the STATIC vnode shape (`children.length === 1 && typeof children[0] === 'function'`), never from the rendered value — so it is uniform across every value a slot can produce, which is what separates it from the value-conditional scheme that previously regressed 83/5000 parity-fuzz seeds by putting a marked range next to an unmarked one. An accessor with siblings, inside a Fragment, or at the root keeps its markers, because there the extent genuinely is unknowable.

Four surfaces move together: `renderElement` and `streamElementNode` (`@pyreon/runtime-server`), `hydrateElement` plus the `<For>` row plan and the compiled-`_tpl` adopt verifier (`@pyreon/runtime-dom`), and the new `_escSole` emit in BOTH `@pyreon/compiler` backends. `_escSole` is a new `@pyreon/runtime-server` export: `_esc` with one extra branch that unwraps a function value without markers, which is what makes the emit correct for `{() => sig()}` (the accessor reaches the hole as a function) and `{sig()}` (the compiler wraps it, so it arrives as a value) alike.

The marker triplet also carried a per-row structural guard on the hydration fast paths — it is what proved a compiled row's dynamic slot still held a TEXT node, so a row whose accessor rendered empty or a VNode bailed to the interpretive walk instead of binding the wrong node. With the markers gone that invariant is stated directly, in both `replayRowPlan` and the `_tpl` adopt replay.

Verified at 20,000 seeds of the SSR↔hydration parity fuzz and 5,000 seeds each of the compiler's cross-backend `fuzz-equivalence` and the `_ssr`-vs-h() `ssr-template-fuzz`; the seed counts of all three are now overridable via `PYREON_FUZZ_SEEDS`.
