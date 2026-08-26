---
"@pyreon/rich-text": patch
---

perf(rich-text): skip the redundant per-keystroke document re-serialization in `bindRichTextToSignal`

A two-way `bindRichTextToSignal` (the common draft-persistence / CMS-builder
shape) previously paid **two full `JSON.stringify` of the entire document on
every keystroke**: each edit flows editor → signal → back to the
`signalToEditor` effect, which structurally compared the incoming value against
`editor.json.peek()` only to discover it was the value it had just emitted. The
`applyingFrom*` flags cannot catch this — Pyreon defers the cross-effect re-run
past the synchronous block, so the flag is already `false` by the time the echo
arrives (the code's own comment documents exactly this for the sibling guard).

`bindRichTextToSignal` now records the exact reference it last pushed to the
signal and short-circuits the echo re-run by identity — an O(1) test, since
`editor.json()` / `editor.html()` return a fresh value each change. A genuine
external write is a different reference and still falls through to the
structural compare, so loop-prevention and external-sync behaviour are
unchanged. Cost scales with document size, so the win grows with the document.

Bisect-verified: reverting the guard makes the echo run two `JSON.stringify`
per keystroke (test asserts 0); the external-write path still runs the compare.
