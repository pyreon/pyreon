---
'@pyreon/flow': patch
'@pyreon/native-compiler': patch
---

A `<path d="…">` in a native Flow custom edge or connection line now renders natively for any path data. Before, only path-helper results and the connection line's `path()` accessor lowered, and a path string such as a template literal or a constant was dropped. The Swift and Kotlin runtimes now parse SVG path data themselves, covering every command (M L H V C S Q T A Z, absolute and relative) with arcs converted to cubic curves.

The paint now follows the browser's rules for an SVG path: fill defaults to black, stroke to none and stroke width to 1, and a `style` declaration beats the matching attribute. Previously the native default was a grey stroke with no fill, and `style` was read by taking its first hex colour.
