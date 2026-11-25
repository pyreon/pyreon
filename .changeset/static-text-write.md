---
'@pyreon/runtime-dom': patch
---

A static text child written into an empty element (`<td>{row.id}</td>`, an `h()` element with one text child) uses `textContent` again, still handing a number to the DOM unconverted: it is the cheapest text write in Chromium, about 21 µs less per 1,000 cells than `replaceChildren(n)`. A `<For>` row no longer allocates a closure and a captured context to open its collector window. The rendered text is unchanged.
