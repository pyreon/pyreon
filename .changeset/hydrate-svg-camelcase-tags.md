---
'@pyreon/runtime-dom': patch
---

Hydration adopts server-rendered camelCase SVG elements (`linearGradient`, `clipPath`, `foreignObject`, `textPath`, `feGaussianBlur` and every other name the HTML parser case-adjusts) instead of reporting a tag mismatch and re-mounting them. The element walk and the `<For>` row-plan replay compare `localName` with the vnode type.
