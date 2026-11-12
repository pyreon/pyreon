---
'@pyreon/zero': patch
---

`seoPlugin({ sitemap: { exclude } })` now also leaves out excluded pages that arrive through `additionalPaths`, including every prerendered page under `useSsgPaths: true`. Before, `exclude` filtered only the route-file scan, so an excluded SSG page was listed in `sitemap.xml` anyway.
