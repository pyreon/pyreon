---
'@pyreon/elements': patch
---

`Element` and its `Wrapper` no longer build a `rest` copy of their props on every render just to merge it again. They pick only the props they consume and merge the rest straight from the incoming props, excluding their own keys. The resulting props are identical.
