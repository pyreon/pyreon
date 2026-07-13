---
"@pyreon/runtime-dom": patch
---

Fix a reactive style **object** not clearing a property whose value is
`null`/`undefined`. `{ background: active ? 'orange' : null }` produced
`String(null)` → `"null"`, and `setProperty('background', 'null')` is an invalid
CSS value the browser silently ignores — leaving the previous value in place
(the key was also still tracked as "present", so the stale-key sweep skipped
it). The visible symptom: a single-select toggle (the coolgrid docs preset
selector, a tab bar, etc.) left **every** previously-clicked item styled-active.

A `null`/`undefined` value now removes the property (via `removeProperty`) and
stops tracking it, so the `cond ? value : null` toggle idiom clears cleanly.
Distinct from the already-working "key disappears from the object" removal
(#233) — this covers a key that stays with a `null` value.
