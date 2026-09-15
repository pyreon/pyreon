---
'@pyreon/compiler': minor
'@pyreon/runtime-server': patch
---

Compiler audit fixes (both backends, byte-identical):

- A multi-line JSX attribute (or a JS-string attribute carrying `\n`/`\r`/U+2028) baked a raw line terminator into the `_tpl` HTML string and broke the build with `Unterminated string`; line terminators now bake as numeric entities, a JSX attribute string preserves a well-formed entity once (`title="a&quot;b"` renders `a"b`, not the source text), and a template-literal attribute bakes its cooked value.
- Static content inside `<script>`/`<style>` (raw-text elements — entities are never decoded there) keeps the h() path instead of an entity-corrupted bake; a void element written with children bails instead of silently dropping them. `renderToString`/`renderToStream` now serialize `<script>`/`<style>` text raw with the React-style break-out escape instead of `escapeHtml`.
- A plain attribute written AFTER a spread (`<a {...p} rel="noopener">`) bails to h() so it wins over the spread key, as JSX object semantics require — the template path applied the spread last and inverted it.
- The signal auto-call pass recognises every binding form as a shadow (`catch (e)`, `for (const x of …)`, nested destructuring, block-scoped `let`, function/class declarations); a local sharing a module signal's name was auto-called and threw `x is not a function`.
- The native backend parses every filename as TSX exactly like the JS backend (a Vite `?v=` id, `.pyreon`, an uppercase extension used to parse as plain JavaScript and return raw JSX as a success); the Reactivity Lens reports props-backed component children; a native panic falls back to the JS backend as documented (`catch_unwind`).
