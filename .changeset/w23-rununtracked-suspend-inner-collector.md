---
'@pyreon/reactivity': patch
---

Fix W23: `runUntracked` now suspends `_innerEffectCollector` in lock-step
with `activeEffect`. Previously child component effects created inside
`mountFor`'s `runUntracked` wrap (PR #490) were auto-registered as inner
effects of the For's outer effect, then silently disposed on the For's
next re-run — breaking every effect-derived subscription in the child
subtree on the first source-signal mutation.

Discovered in T4.2 / kanban audit (PR #982). Bisect-verified by the new
regression test `packages/core/runtime-dom/src/tests/w23-child-effect-loss.browser.test.ts`.

This was a SHOWSTOPPER for any Pyreon app with per-row mutations of a
`<For>` source signal (Trello / Notion / Linear / spreadsheet shapes).
Hn-clone-style read-only feeds didn't surface it because their source
signal is set once at load and never re-fires.

`_innerEffectCollector` moved from `effect.ts` to `tracking.ts` (kept
opaque as `unknown[]` to avoid a circular dep); effect.ts accesses it
through the new `getInnerEffectCollector` / `setInnerEffectCollector`
internal getters/setters.
