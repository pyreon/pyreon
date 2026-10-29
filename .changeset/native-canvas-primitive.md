---
'@pyreon/primitives': minor
'@pyreon/native-compiler': minor
'@pyreon/native-runtime-swift': minor
'@pyreon/native-runtime-kotlin': minor
---

Add the `<Canvas>` vector-drawing primitive (#3985).

`<Canvas width height>` is a fixed-size, clipped drawing surface. Its children are the shape primitives `CanvasRect`, `CanvasCircle`, `CanvasLine`, `CanvasPath` (full SVG path data, arcs included) and `CanvasText`, with `fill` / `stroke` / `strokeWidth` taking a colour token or a `#hex` literal. Shapes are ordinary JSX children, so `<For>`, `<Show>` and signal-driven props work inside a canvas.

On the web each shape is an absolutely positioned `<svg>` layer. On iOS the canvas is `PyreonCanvas` (a clipped `ZStack` of SwiftUI `Path`s, with a runtime SVG path parser). On Android it is `PyreonCanvas` (a clipped `Box` of Compose `Canvas` layers, using androidx's `PathParser`).
