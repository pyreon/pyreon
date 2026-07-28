---
'@pyreon/feature': patch
---

`extractFields` now reads enum members from zod v4 schemas. It looked for `_def.values`, which v4 does not have — v4 stores members as an entries map and exposes them as `.options` — so an enum field came back correctly typed with `enumValues: undefined`, a documented field that was silently always empty. Downstream that reads as "this enum has no members" rather than "we could not read them", which is the difference between generating a picker with the real options and generating a free-text box. Native enums are read by value, since a native enum maps name → value.
