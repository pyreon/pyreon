---
'@pyreon/compiler': patch
---

Two `detectReactPatterns` rules no longer report correct code as a mistake.

`dangerouslySetInnerHTML` is no longer flagged. Pyreon ships both it (raw,
React semantics, the author owns sanitization) and `innerHTML` (sanitized),
with different contracts. The old advice to "use innerHTML in Pyreon" silently
changed the value through a sanitizer, and `innerHTML` throws during SSR — so
taking the suggestion broke server rendering.

`onChange` is flagged only where `change` actually fires on blur: `<textarea>`
and text-like `<input>`. On a checkbox, radio, file, range, colour or date
input — and on `<select>` — `change` fires when the value is committed, which
is what the author wants, so `onInput` is the wrong fix there.
