---
'@pyreon/compiler': minor
'@pyreon/runtime-server': patch
---

Compiler audit fixes (both backends, byte-identical):

- A multi-line JSX attribute (or a JS-string attribute carrying `\n`/`\r`/U+2028) baked a raw line terminator into the `_tpl` HTML string and broke the build with `Unterminated string`; line terminators now bake as numeric entities, a JSX attribute string preserves a well-formed entity once (`title="a&quot;b"` renders `a"b`, not the source text), and a template-literal attribute bakes its cooked value.
- Static content inside `<script>`/`<style>` (raw-text elements — entities are never decoded there) keeps the h() path instead of an entity-corrupted bake; a void element written with children bails instead of silently dropping them. `renderToString`/`renderToStream` now serialize `<script>`/`<style>` text raw with the React-style break-out escape instead of `escapeHtml`.
- A plain attribute written AFTER a spread (`<a {...p} rel="noopener">`) bails to h() so it wins over the spread key, as JSX object semantics require — the template path applied the spread last and inverted it.
- The signal auto-call pass recognises every binding form as a shadow (`catch (e)`, `for (const x of …)`, nested destructuring, block-scoped `let`, function/class declarations); a local sharing a module signal's name was auto-called and threw `x is not a function`.
- SSR fast path (`ssrTemplate`): a lowercase handler (`onclick={fn}`) is skipped like the h() path skips it — it used to reach `_ssrAttrGen`, which invoked the function during render and baked its return; a literal `aria-*={false}` bakes `aria-*="false"` (was omitted); a method call (`x.join()`, `n.toFixed()`) no longer counts as a string proof (a null return baked `name="null"`), and `String(x)`/`Number(x)` prove a value only while the module does not rebind the global.
- Plain Mode: a read inside a nested function is no longer hoisted into the effect's tracking prologue (it re-ran the effect on state the body never reads — a timer pile-up); a name shadowed inside the effect is not mistaken for the outer state; a hoisted deep path is optionally chained so the prologue cannot throw before the body's own guard.
- `renderToString`/`renderToStream`: an accessor child of a raw-text element (`<script>`/`<style>`) whose value is not text is invoked once, not twice.
- The native backend parses every filename as TSX exactly like the JS backend (a Vite `?v=` id, `.pyreon`, an uppercase extension used to parse as plain JavaScript and return raw JSX as a success); the Reactivity Lens reports props-backed component children; a native panic falls back to the JS backend as documented (`catch_unwind`).
