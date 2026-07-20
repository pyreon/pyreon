---
"@pyreon/runtime-dom": patch
---

fix(runtime-dom): wire a `ref` that lives inside a spread on a bare DOM element (compiled path)

`<div {...props}>` on a bare DOM element lowers to `_tpl(html, __root => { _applyProps(__root, props) })`. `applyProps` deliberately skips `ref` (it's not a DOM attribute), and the `h()`/hydrate paths wire `ref` themselves in `mountElement`/`hydrateElement` — but the compiled template path had no companion step, so a `ref` inside a spread object was silently dropped. It worked on the `h()` path every unit test uses, masking it.

Real impact: `@pyreon/ui-primitives` CalendarBase's `getDayProps()` returns `{ ref }` feeding its focus registry — roving arrow-key focus was dead in the compiled ui-showcase — and SpoilerBase spreads `useElementSize`'s ref, so measured height stayed 0 and the "show more" toggle never appeared. Any app doing `<div {...propsWithRef}>` was affected.

Fix: the exported `_applyProps` (the compiled template path's entry) is now a wrapper — `applyProps` plus wiring the spread's `ref`, exactly as the direct `<div ref={fn}>` codegen and `mountElement` do. `mountElement`/`hydrate` call the internal `applyProps` (not the `_` export), so they never double-fire. Pure runtime fix, no compiler or native-binary change. Bisect-verified against the real compiler transform; real-Chromium focus lock added. (Follow-up: the compiled template bindFn discards the spread cleanup, so ref-null-on-unmount + spread reactive-prop cleanups need a separate compiler change to capture it — a bounded registry-leak, not a focus break.)
