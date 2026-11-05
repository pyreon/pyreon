---
'@pyreon/native-runtime-kotlin': patch
---

Android `<CanvasPath>` now draws malformed SVG path data up to the first invalid command, matching the web (SVG's error rule) and iOS. androidx `PathParser` throws on an unknown command such as `X`, so `d="M10 10 L20 20 X 5 5"` previously drew nothing on Android while drawing the line on the other two targets. The path is now cut to its well-formed prefix (`pyreonSvgPathValidPrefix`, the same grammar as the iOS parser) before it reaches the parser.
