---
'@pyreon/runtime-dom': patch
---

An element mounted after its `<svg>` or `<math>` ancestor (a `<Show>` branch, a reactive child, a `<For>` row, a portal into an SVG target, the fresh mount after a hydration mismatch) is created in the right namespace. The namespace now comes from the parent the element is inserted into, as the HTML parser decides it, so SVG elements that were missing from a tag list (`feDropShadow`, `feFuncA`, `mpath`, `switch`, …) render, HTML below `<foreignObject>` is HTML, and MathML below `mtext`/`mi`/… is HTML. A compiled template rooted at any SVG element is parsed as SVG.
