---
'@pyreon/lint': patch
---

`pyreon/no-href-navigation` no longer flags an `<a>` that declares it is not an in-app navigation: one with `target`, `download`, or a `rel` containing `alternate` (a feed) or `external`. `<RouterLink>` would be wrong for each — the router would try to match `/blog/rss.xml` as a route.
