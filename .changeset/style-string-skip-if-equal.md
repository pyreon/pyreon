---
"@pyreon/runtime-dom": patch
---

`applyStyleProp` (= the compiled template path's `_setStyle`) now skips the `el.style.cssText` write when a reactive STRING style re-emits an unchanged value — previously every re-emit paid a full declaration parse + style invalidation even when the string was byte-identical, while the sibling class binding already diffed before writing. Because `cssText` readback is engine-normalized (never equal to the input string), the guard caches the last-written pair (source string + its normalized serialization) per element and skips only when the source is unchanged AND the live declaration still matches what the framework's own write produced — so an external style mutation between identical emits still gets rewritten (same live-DOM-verified philosophy as the class guard). Object-style handling is unchanged.
