---
'@pyreon/compiler': patch
---

The `array-map-jsx` React-pattern detector (MCP `validate`, `pyreon check`, doctor) no longer fires on a `.map()` that renders no list: an attribute value that maps data (`rows={lines.map((l) => [l.item, l.qty])}`) or a callback that returns no JSX. It reports a `.map()` rendered as children whose callback renders JSX, or whose callback is not inline.
