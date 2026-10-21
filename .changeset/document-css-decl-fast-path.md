---
'@pyreon/document': patch
---

Faster `html` and `email` rendering. The single-declaration style helper used for every table cell now builds its `prop:value` directly. Before, it allocated a one-key object and ran `Object.entries`, an array and a `join`, even when the value was unset and the result was empty. Rendering a 500-row report got about 2.5× faster in `html` (230 → 84–98 µs) and about 3× faster in `email` (210–221 → 71–72 µs). Sanitizing still goes through one shared function, and output is byte-identical in all 16 string formats, including adversarial style values.
