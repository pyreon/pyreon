---
"@pyreon/runtime-dom": patch
"@pyreon/compiler": patch
---

feat(compiler,runtime-dom): DOM-element spread cleans up on unmount — spread is now fully first-class

Building on the spread-`ref` fire fix, the compiler now CAPTURES the cleanup that `_applyProps` returns instead of discarding it — so `<div {...props}>` on a bare DOM element disposes its reactive-prop bindings AND nulls a spread `ref` on unmount. Together with the ref-fire fix, spreading props onto a DOM element now Just Works: reactive props update, refs fire and null, everything is torn down on unmount.

- Identifier spread `{...props}` → `const __dN = _applyProps(el, props)` (applied once, disposer captured).
- Call spread `{...make()}` → `const __dN = _bindSpread(el, () => make())` — a new `_bindSpread` runtime helper (a `renderEffect` that re-applies on dependency change, disposing each pass's cleanup before the next and at unmount). `_bind`/`renderEffect` don't open an `onCleanup` window, so the cleanup is threaded explicitly in the helper.

Both compiler backends (JS + native Rust) emit byte-identical code (native-equivalence + fuzz pass). `mountElement`/`hydrate` are untouched (internal `applyProps`), so no double-fire. Bisect-verified through the real transform; full lifecycle regression (reactive update+dispose, ref fire+null) added.
