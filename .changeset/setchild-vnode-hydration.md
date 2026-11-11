---
'@pyreon/runtime-dom': patch
---

Hydration no longer doubles a VNode passed as an element's only child. A compiled `<td>{x.cell.content}</td>` inside `<For>`, where `content` is sometimes a string and sometimes an element, used to keep the server's nodes and append a fresh copy beside them in every VNode cell after the first row. The cell now adopts the server's nodes, as a function child already did.
