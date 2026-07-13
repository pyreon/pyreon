---
"@pyreon/hotkeys": minor
---

`@pyreon/hotkeys` excellence pass — three bug fixes, one new API, a dispatch optimization, and a competitor benchmark:

- **Fix: shifted-symbol shortcuts never fired.** A single symbol key (`?`, `!`, `+`) is typed *with* Shift on a standard layout, so the canonical "show help" shortcut `?` never matched (exact-modifier matching rejected the `Shift+/` keystroke that produces it). `matchesCombo` now ignores the Shift modifier for single-symbol keys — the produced `event.key` already encodes the character, so `/` and `?` stay distinct. Letters and named keys keep exact Shift-matching (`a` ≠ `Shift+A`). Bind `?` directly, not `shift+?`.

- **Fix: SSR cross-request state bleed + leak.** The registry is a module-level singleton shared across every SSR request. `registerHotkey` pushed entries and `enableScope` flipped scope state on the server, so one request's hotkeys/scopes leaked into the next (and grew unboundedly — no unmount fires during `renderToString`). All mutating entry points are now no-ops on the server. `getRegisteredHotkeys()` is therefore client-runtime state.

- **Fix: scopes are now reference-counted.** `enableScope`/`disableScope` (and the `useHotkeyScope` hook) are acquire/release: a scope stays active until every acquirer releases it. Previously the first component to unmount disabled a shared scope for every surviving component — stacked panels / nested modals sharing a scope silently broke. **Behavior change:** imperative `enableScope`/`disableScope` calls should now be paired evenly.

- **New: `getHotkeyConflicts()`** — detects registered shortcuts that would fire on the same keystroke within the same scope. Matches on the parsed combo, so aliased duplicates (`ctrl+s` vs `control+s`, `mod+s` vs `ctrl+s` off Mac) are caught. Cross-scope overlaps are intentional layering and are not reported. Makes the long-advertised "conflict detection" real.

- **Perf: dispatch hoists per-keydown-constant work out of the per-entry loop** (`event.key` lower-cased once, input-focus checked once, combo checked first as the most selective field). Semantics-preserving; measured ~5× faster hit/miss dispatch on the new `bench:keys` benchmark (Pyreon now leads tinykeys / hotkeys-js / mousetrap on dispatch and register).
