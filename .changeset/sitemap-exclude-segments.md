---
"@pyreon/zero": minor
---

Sitemap `exclude` string entries now match on a segment boundary (`'/blog'` drops `/blog` and `/blog/post`, not `/blogroll`), and `exclude` accepts `RegExp` entries that drop exactly the matched path. `exclude` now also applies to `additionalPaths` and SSG-enumerated paths.
