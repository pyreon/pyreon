---
'@pyreon/runtime-dom': patch
---

Hydrating compiled JSX now reports server/client divergences in development, as `h()` content already did (#4419).

A compiled `_tpl` template adopts the server's DOM and its bind writes the client's values into it. When those values differed, the write corrected the page silently, so there was no `[Pyreon] Hydration mismatch` warning and no `onHydrationMismatch` call for nearly every component in a JSX app. Every compiled text write into adopted server DOM now reports, with the same message and payload as the `h()` path: `_setChild`, `_setChildAt`, `_bindText`, `_bindProp`, `bindPolymorphicText` and `_textSlot`. So does a compiled element that cannot be adopted because the server rendered a different tag or text; the report names the first difference. A mismatch is reported exactly when hydration changes what the server rendered. Attribute differences are not reported, as on the `h()` path. Compiled-path reports are development-only and add no bytes to production builds.

The `h()` path also reports an accessor that renders text over an empty server element or range, which it used to mount silently. Mismatches inside a compiled slot or mount hole now carry a path from the hydration root (`root > div > reactive > b`) instead of `slot > …`.
