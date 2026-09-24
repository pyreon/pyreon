---
'@pyreon/flow': patch
'@pyreon/native-compiler': patch
---

An inline `<svg>` inside a native Flow node, edge or connection-line renderer now draws natively on iOS and Android instead of being dropped with a pointer to `<FlowWebView>`. Every SVG shape (`path`, `rect` including rounded corners, `circle`, `ellipse`, `line`, `polyline`, `polygon`, and shapes inside `<g>`) becomes path data drawn in one canvas, sized from `width` / `height` (or the `viewBox` aspect) and scaled by the `viewBox` with the default `xMidYMid meet` or `preserveAspectRatio="none"`. `fill`, `stroke` and `stroke-width` inherit from the `<svg>` and `<g>` as they do in SVG. A dynamic attribute (`cx={…}`) is interpolated into the path at runtime. What does not lower (`<text>`, gradients, `transform`, dynamic children) is named in a warning.

Plain `<div>`, `<p>` and `<span>` in a Flow renderer now lower in the two cases where the native layout provably matches the browser's: text-only content becomes a text run, and a `<div>` of block children (or a single child) becomes a flush-left, gap-free stack. A `class`, a `style`, an event handler or inline-flow children keep the existing warning. Outside a Flow renderer, both `<svg>` and DOM elements keep their warning.
