---
"@pyreon/zero": patch
---

fix(zero): 404 pages force `noindex` over an index-permitting `<Meta>` robots default

`ensureNoindexMeta` previously bailed out whenever the rendered 404 head already
contained any `<meta name="robots">`. But `<Meta>` emits its `index, follow`
default whenever the user doesn't pass an explicit `robots`, so every `_404.tsx`
that used `<Meta>` (the common case, for title/canonical) silently shipped an
**indexable** 404. A 404 is never indexable, so the helper now OVERRIDES an
index-permitting robots value (`index, follow` / `all`) to `noindex, nofollow`
while still preserving a deliberate `noindex` / `none` directive verbatim.

Closes the bokisch.com 0.27.1 Lighthouse finding (`<meta name="robots"
content="index, follow">` on the live `/404.html`). Applies to both the
runtime SSR path (`render404Page`) and the SSG build path
(`__renderNotFound`) since they share this boundary.
