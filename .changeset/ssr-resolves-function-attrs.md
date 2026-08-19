---
'@pyreon/runtime-server': minor
'@pyreon/compiler': minor
---

Fix two SSR fast-path divergences where the compiled `_ssr` output disagreed with the `h()` path.

**A function-valued attribute serialized the closure SOURCE.** The compile-to-string SSR fast path picks the lean `_ssrAttrGen` / `_ssrAttrUrl` helpers from the attribute NAME alone, but whether `renderProp` resolves a value depends on the value's TYPE — so the name-based selection could never rule out the function branch, and both helpers omitted it. A bare identifier holding an accessor (`d={geometry}` where `geometry` came from a prop or a `const`) rendered as `d="() =&gt; geometry()?.path ?? &quot;&quot;"` instead of the resolved value: visible in the SSR HTML and a guaranteed hydration mismatch, since the client's `applyAttrProp` resolves. Affected the lean subset only — `d`, `id`, `title`, `role`, `data-*`, `href`, `src` — while `class` / `style` / `aria-*` / camelCase names (which route through `renderProp` verbatim) were correct, which is why the shape hid. Resolution now runs before the URL guard, so an accessor returning `javascript:` is stripped rather than stringified.

**A prefilled `<textarea>` server-rendered blank.** `<textarea>` has no `value` CONTENT attribute — the value IS the element's text content — so `renderProp` skips it and emits it as the child. The fast path serialized it as an attribute instead, producing a dead `value="…"` and an EMPTY textarea: any server-rendered draft, bio or comment came back blank, stayed blank with JS off, and mismatched on hydration. `<textarea value>` now bails to the `h()` path, joining the existing `select` / `option` bail for the same PZ-09 concern; the bail is placed at the attribute seam so it also covers the compile-time bake arm and costs nothing for a `<textarea>` without a `value`. Mirrored in both compiler backends.
