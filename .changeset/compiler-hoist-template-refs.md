---
"@pyreon/compiler": patch
"@pyreon/flow": patch
---

fix(compiler): hoist ALL template node-ref captures above `_mountSlot`/`replaceChild` mutations (two-phase template binds, both backends byte-identical)

A reactive/conditional slot child (`{cond() ? <A/> : <B/>}`, `{cond && <el/>}`, `{arr.map(…)}`) placed BEFORE static siblings broke the compiled template's sibling ref-walk: `_mountSlot` removes its `<!>` placeholder and inserts content + a `<!--pyreon-->` marker (net sibling-count delta ≠ 0), and sibling refs / later placeholder walks were emitted AFTER that mutation. Symptoms (initial-state-dependent): `Cannot read properties of undefined (reading 'setProperty')` (style binding hit the marker comment), `null (reading 'setAttribute')` / `null (reading 'data')` (walk past the end), and — with TWO adjacent slots — the second slot's stale walk resolved to the FIRST slot's reactive marker, which `_mountSlot` then removed, so slot 0's next falsy→truthy re-flip threw `insertBefore … is not a child of this node` and SILENTLY lost the subtree (fired on client mount AND post-hydration; single flips were accidentally correct).

Template-bind emission is now two-phase: phase 1 (`refLines`) captures every pristine-clone node reference — element walks (`const __eN = …`), sole-text captures (`const __tN = X.firstChild`), and new hoisted placeholder consts (`const __pN = <walk>`) for `_mountSlot` placeholder args + `replaceChild` targets — before phase 2 (`bindLines`) runs any mutation. Phase-2 ops are identity-based, hence order-independent w.r.t. sibling structure. No runtime-dom change; template HTML / hydration markers unchanged.

This fixes the long-documented `@pyreon/flow` overlay child-order limitation at the root (bisect-verified in real Chromium): `<Controls>` before `<MiniMap>` now renders — the MiniMap-before-Controls ordering constraint is no longer required on current compiler versions. `@pyreon/flow`'s Controls/MiniMap JSDoc is updated accordingly (older compilers still need MiniMap first). Also adds a `pyreon doctor diagnose` catalog entry for the old-version error signatures.
