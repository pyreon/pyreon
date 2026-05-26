---
"@pyreon/zero": patch
"@pyreon/hotkeys": minor
"@pyreon/runtime-dom": patch
"@pyreon/feature": patch
---

Fix 4 more framework DX walls surfaced by deep-audit of the HN-clone (#942) — all bisect-verified at the unit level.

**W13 — `@pyreon/zero/client` strips URL query string on SPA cold-start.**
`startClient` called `router.replace(router.currentRoute().path)` to kick
off the loader pipeline, but `currentRoute().path` is the pathname ONLY
(query + hash stripped by `resolveRoute`). The `router.replace(pathname)`
then wrote the bare URL via `history.replaceState`, silently dropping any
query params present on the initial-load URL. Direct-link sharing of
`/search?q=react` was broken on cold-start — `useUrlState('q')` /
`useTypedSearchParams` read empty `window.location.search` and fell back
to defaults. Fix: pass the FULL URL (pathname + search + hash) instead.

**W14 — `@pyreon/hotkeys` sequential combos (`'g t'`) didn't work.**
CLAUDE.md documented vim/Gmail-style `g t` / `g n` combos but the
implementation only split on `+`. So `'g t'` parsed as a single key
literal `'g t'` (with space) that could never match a keystroke. Fix:
`registerHotkey` now splits the shortcut on whitespace into a sequence
of sub-combos. Each non-first combo is recorded as `entry.sequence[]`
and matched against subsequent keystrokes within a 1-second timeout
window. Three-step sequences (`a b c`) and combos with modifiers
(`ctrl+k p`) both work. 9 new specs cover the contract.

**W16 — `@pyreon/runtime-dom`'s `<Transition>` crashed with null ref**
when wrapped inside `<Portal>`/`<Show>`/other reactive wrappers. The
`appear: true` path queued `applyEnter(ref.current as HTMLElement)`
in a microtask, but the child commit could be one or more microtasks
behind. `applyEnter(null)` → `el.classList.remove(...)` → "Cannot read
properties of null (reading 'classList')". Fix: `safeApplyEnter`
retries up to 16 microtasks for the ref to populate before silently
giving up. Bisect-verified spec.

**W17 — `@pyreon/feature`'s `feature.useForm()` didn't invalidate the
list query after submit.** `useForm`'s `onSubmit` called `http.create()`
/ `http.update()` DIRECTLY, bypassing the `useCreate()` / `useUpdate()`
mutation pipeline that wires `client.invalidateQueries` in `onSuccess`.
So after the form submitted, the list view didn't refetch and the UI
silently failed to show the new/updated item until manual reload. Fix:
`useForm`'s onSubmit now invalidates `queryKeyBase` (and the per-id key
in edit mode), matching the behaviour of `useCreate()` / `useUpdate()`.
96 feature tests still pass.

Discovered by deep-auditing every interactive flow in the HN-clone
(`#942`) with Playwright. Each is bisect-verified — revert the source
fix → the new test fails; restore → it passes.
