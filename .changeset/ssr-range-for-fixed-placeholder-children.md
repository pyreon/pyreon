---
'@pyreon/compiler': patch
'@pyreon/core': patch
'@pyreon/runtime-dom': patch
---

Hydration adopts a compiled element whose fixed (non-reactive) child sits between siblings, for example `<span>{flag ? <b>{flag}</b> : null}<i /></span>` or a `<For>` row `<li><b />{row.name}<i /></li>`. The server rendered such a child without a range, so the client could not find where it ended and re-created the whole element with identical content and no report. The SSR compile now brackets every child the client template gives a placeholder (`_slot` from `@pyreon/core` on the h() path, baked markers on the `_ssr` path), and `_setChildAt` adopts that range. Server HTML grows by 17 bytes (`<!--$-->` and `<!--/$-->`) per such child. A static `false` child of a compiled element no longer renders the text "false".
