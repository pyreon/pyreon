---
'@pyreon/core': patch
---

SVG geometry attributes (`x`, `y`, `x1`/`y1`/`x2`/`y2`, `cx`/`cy`/`r`/`rx`/`ry`, `width`, `height`, `points`) accept the reactive accessor form (`x={() => …}`) in the JSX types, matching `fill` / `stroke` / `d` / `transform` / `opacity`. Type-only widening — the runtime already resolves accessor-valued attributes; the fix for a missing variant belongs here, never an `as never` cast at the call site.
