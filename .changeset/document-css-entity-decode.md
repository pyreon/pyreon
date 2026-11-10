---
'@pyreon/document': patch
---

`sanitizeCss` (the funnel for every style value in the `html` and `email` renderers) now decodes character references before stripping and removes every remaining `&`. The browser entity-decodes a `style` attribute before CSS parsing, so `&#59;` and friends previously re-created the stripped separators and let one value add arbitrary declarations.
