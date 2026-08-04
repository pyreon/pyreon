---
'@pyreon/cli': minor
---

`pyreon add` gains recipes for the three tool packages — `@pyreon/loom`,
`@pyreon/atlas` and `@pyreon/config`.

They are deliberately shaped differently from the library recipes: a dev tool
has nothing to wire into app code, so `usage` is the command you actually run
and the config surface it reads. Handing someone a provider-shaped recipe for a
CLI would waste their afternoon.
