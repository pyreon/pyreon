---
'@pyreon/native-compiler': patch
---

Native: `window.setTimeout(…)`, `globalThis.setInterval(…)` and the matching `clear*` calls (also through `self`) now lower exactly like the bare timer functions, a component-body timer included. On the web, the global object's method is the global function. Natively these calls were copied verbatim, so the build failed on `window` / `globalThis`. A file that declares its own `window`, `globalThis` or `self` is left alone.
