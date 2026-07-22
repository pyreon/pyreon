---
'@pyreon/hotkeys': minor
---

Completeness + performance sweep:

- **Key-bucketed dispatch** — entries are indexed by their first combo's `event.key`, so a keystroke touches only the entries bound to that exact key. The miss path (every non-shortcut keypress) becomes a single Map lookup, flat regardless of registry size (bench: ~flat at 48 bindings while linear-scan libraries degrade ~3×). Registration order is preserved within a bucket — the only place it is observable.
- **Comma-separated lists** — `registerHotkey('ctrl+s, mod+p', save)` binds both combos to one handler; one unregister removes all. New `splitShortcutList` export; `comma` alias for the literal key (`'ctrl+,'` also parses).
- **`event: 'keyup'`** — act-on-release bindings (push-to-talk). Sequences stay keydown-only and reject `'keyup'` at registration.
- **`once`** — fire at most once, then auto-unregister (safe mid-bucket: a once-splice doesn't skip same-keystroke neighbours).
- **`ignoreRepeat`** — skip held-key auto-repeat (`event.repeat`) for one-shot actions.
- **Selective `enableOnInputs`** — in addition to the boolean, an array form (`['input']`) allows firing in chosen editable surfaces only.
- **Element-scoped hotkeys** — `target: element` listens on a specific element (fires only while the event reaches it); ONE shared listener per (target, event-type), detached when the target's last hotkey unregisters; element states fully released (no DOM pinning).
- **Pressed-key introspection** — `getPressedKeys()` reactive held-key set (listeners attach lazily on first use; cleared on window blur) + `isKeyPressed(key)` point read with alias resolution.
- **Programmatic `trigger(shortcut, { scope? })`** — fire the bound handlers (command palettes, macros, tests); respects scope + `enabled` gates; returns the fired count.
- New `InputKind` type export.
