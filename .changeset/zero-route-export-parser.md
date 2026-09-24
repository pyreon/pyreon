---
'@pyreon/zero': patch
---

fix(zero): detect route exports with a real parser

Route files are now read with `oxc-parser` to find their `loader`, `guard`, `meta`, `renderMode`, `middleware`, `revalidate` and other exports. The previous character scanner treated every quote as the start of a string, so an apostrophe in JSX text (`<p>Don't miss</p>`) or a quote in a regex (`/'/g`) hid every export after it: the route lost its loader, guard or render mode without any error. Its type-assertion stripper also cut a `meta` string containing `(` in half (`'Known as the sad face :('`), which made the generated routes module a syntax error.

New forms are recognised as well: `export * as NAME from`, destructured exports, and `.ts` files using `<T>value` casts. Type-only exports are ignored. `as const` and `satisfies` are removed from captured literals at any depth, not only at the top level. `oxc-parser` is now a direct dependency (it was already installed through `@pyreon/compiler`).
