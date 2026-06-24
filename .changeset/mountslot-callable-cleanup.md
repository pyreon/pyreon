---
"@pyreon/runtime-dom": patch
---

fix(runtime-dom): `_mountSlot` returns a callable cleanup for falsy slots (fixes flow `g is not a function`)

A conditional JSX slot that evaluates falsy/boolean — `{showLock && <button>}` → `false`,
`{cond ? <x/> : null}` → `null`, `{cond && ...}` → `true` — crashed on the component's
re-render or unmount with `TypeError: <slot> is not a function`.

Root cause: `_mountSlot` returned `null` for `null` / `false` / `true` children, but the
compiler emits a template's cleanup as an UNCONDITIONAL call of every slot disposer
(`() => { __d0(); __d1(); … }`). So a falsy slot's disposer was `null`, and `null()` threw
the moment the reactive boundary re-ran or the component unmounted. Long-standing since the
function's inception (#170) — it only surfaces when such a slot's cleanup actually fires.

This was the live `@pyreon/flow` **Controls** crash: `showLock` defaults `false`, so the lock
button's slot was `_mountSlot(false)` → `null`, and Controls' cleanup `() => { …; g(); … }`
ran `g()` = `null()` → `[pyreon] Unhandled effect error: TypeError: g is not a function` on
flow interaction (drag/zoom) and on navigating away.

Fix: `_mountSlot` now always returns a callable cleanup — a shared no-op for the falsy case —
so the compiler-emitted unconditional disposer call is always safe. Return type tightened from
`(() => void) | null` to `() => void`.

Verified: bisect-locked unit tests (`_mountSlot(null|false|true, …)` returns a function and is
safe to call — reverting to `null` fails with `expected 'object' to be 'function'`); root-caused
directly from the deployed minified chunk (`kt(false)` → `null`, then `g()` in the cleanup).
