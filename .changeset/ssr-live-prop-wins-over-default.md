---
'@pyreon/runtime-server': patch
'@pyreon/compiler': patch
---

SSR no longer emits a content attribute twice when an element carries both a live prop and its default. `<input defaultValue="def" value="cur">` rendered `value="def" value="cur"`, and the HTML parser keeps the FIRST, so the server page showed the default until hydration (and for good with JavaScript off). `checked` + `defaultChecked` and `muted` + `defaultMuted` had the same shape: `checked={false} defaultChecked` came out checked.

The live prop now decides the attribute whenever it is set (non-nullish), matching the control state a client mount and a hydration produce; a nullish live prop leaves the default in place. The compile-to-string SSR path routes such an element through the `h()` renderer in both compiler backends, since which prop wins is only known at runtime.
