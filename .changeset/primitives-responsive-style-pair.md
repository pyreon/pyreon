---
'@pyreon/primitives': patch
---

A primitive's inline `style` now resolves a two-element `[compact, regular]` responsive pair on the web (`style={{ padding: [8, 24] }}`), as iOS and Android already did. The pair is resolved at the 600 px size-class boundary through one shared `(min-width: 600px)` media query, and it re-resolves when the window crosses that boundary. Before this, the web wrote the array into the DOM as the invalid CSS `8,24`, and the browser dropped it, so the same source had no padding on the web and 8 or 24 on a device. An array of any other length is dropped with a `[Pyreon]` warning, the same as on the native targets. The `style` type is now `string | StyleObject`, and `StyleObject` and `StyleValue` are exported.
