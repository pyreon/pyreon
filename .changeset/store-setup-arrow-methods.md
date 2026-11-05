---
'@pyreon/store': patch
---

Store creation is about a third faster and each store retains ~270 B less: the public `patch` / `subscribe` / `onAction` / `reset` / `dispose` methods are arrow closures over the instance instead of `.bind(this)` bound functions. They remain own properties, so destructuring, detached calls and spreading behave as before.
