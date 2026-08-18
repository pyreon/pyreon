---
'@pyreon/styler': minor
'@pyreon/server': minor
---

fix(ssr): ship the styler CSS for the class names SSR emits

Server-rendered HTML carried styler class names (`pyr-1abc23`) with **no
`<style>` tag at all** on two of the three SSR paths: `@pyreon/zero`'s dev SSR
middleware and its production `createServer`. Measured on `examples/ui-showcase`
before the fix: 23 of 23 styler classes on `/button` had zero matching CSS
rules, on every route. The page hydrated to the correct DOM, so only the FIRST
PAINT was wrong — every SSR page flashed unstyled.

The cause was that `renderPage`'s `collectStyles` hook is opt-in, and of its
three consumers only zero's SSG prerender entry ever passed one. SSG had been
fixed for exactly this bug ("prerendered HTML carried styler-generated class
names … but had ZERO `<style>` tags in the head"), and the sibling call sites
were left behind — a fix applied to one call site rather than to the class.

`renderPage` now defaults `collectStyles` to a `globalThis.__PYREON_STYLER_COLLECT__`
collector that `@pyreon/styler`'s singleton registers on SSR init — the
string-mode twin of the `__PYREON_STYLER_FLUSH__` seam the streaming pipeline
already used, so there is still no `@pyreon/server` → `@pyreon/styler`
dependency. Fixing the one choke point covers all three consumers plus any bare
`@pyreon/server` user, so no caller can forget it again.

Unchanged: an explicit `collectStyles` still wins (SSG is byte-identical);
apps without styler get no global and no `<style>`; the streaming path keeps
its per-boundary watermarked flush, which `getStyleTag()` never disturbs.

Why it survived this long: a second bug hid it. Hydration was discarding the
server DOM and rebuilding it, so users saw *nothing* for ~300ms rather than
seeing the content unstyled. The mask made the defect symptomless — it only
becomes visible once hydration correctly adopts the server DOM.
