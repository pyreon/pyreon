---
'@pyreon/compiler': patch
'@pyreon/runtime-dom': patch
---

Namespaced JSX attributes (`xlink:href`, `xml:lang`) work on the compiled
template path, and the SVG sprite idiom renders on every path.

`xlink:href` parses as a namespaced name, which every name reader in the
template emitter read as the empty string — so the JS backend baked malformed
HTML and the Rust backend dropped the attribute. Both backends now read the
qualified name through one helper, so the element keeps its template instead of
bailing to `h()`.

The runtime half is the part that was actually broken on both paths:
`setAttribute('xlink:href', …)` creates a null-namespace attribute an SVG
`<use>` ignores, where the HTML parser (SSR bytes, and the compiled bake) puts
it in the XLink namespace. `applyAttrProp` / `setStaticProp` now resolve the
namespace the parser would have assigned, so an assigned attribute reproduces a
parsed one byte for byte and a client mount agrees with its own server render.
