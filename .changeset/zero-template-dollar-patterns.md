---
'@pyreon/zero': patch
---

fix(zero): insert rendered pages into the HTML template verbatim

The build-time template injector (SSG pages, the 404 page, SPA shells) and the dev SSR path inserted the rendered page, head tags and loader JSON with a string replacement, so `$$`, `$&`, `` $` `` and `$'` in the content were treated as replacement patterns. A page containing `cost $$5 and $' tail` rendered `cost $5 and` followed by a copy of the rest of the template. Both paths now use replacer functions, so the content is inserted exactly as rendered.
