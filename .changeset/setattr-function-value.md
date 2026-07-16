---
'@pyreon/runtime-dom': patch
---

Fix the compiled-template attribute path stringifying a function-valued attribute into the DOM: `aria-selected={active}` — a bare identifier holding an accessor — rendered the literal closure source (`aria-selected="() => …"`), because `_setAttr`/`applyAttrProp` had no function branch while the `h()` path (`applyProp`) treats callables as reactive accessors and SSR resolves them (also an SSR↔client hydration mismatch). `applyAttrProp` now resolves function values first; when the compiler emits the usual `_bind(() => _setAttr(…))` wrapper the call runs inside the tracked frame, so signal reads inside the accessor stay fully live.
