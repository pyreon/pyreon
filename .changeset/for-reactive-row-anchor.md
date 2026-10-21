---
'@pyreon/runtime-dom': patch
---

Fix `<For>` rows that re-render their own content being duplicated or misplaced on the next reorder. Affected rows include a row that returns an accessor (`(x) => () => <li>{x.label()}</li>`), a component using the reactive-conditional pattern (`return (() => cond() ? <A/> : <B/>)`), and a text row whose value becomes an element.

The list recorded such a row's position by its first DOM node. Once the row re-ran, that node was gone, so the next move re-inserted the stale node and left the live content behind: a duplicated row, rows out of order, and sometimes an `insertBefore … is not a child of this node` error. Rows that aren't a single element are now delimited by their own comment markers, which nothing inside the row can replace. Single-element rows, the common case, are unchanged and get no extra nodes.

The same applied to a list hydrated from server HTML. Hydration consumes the `<!--$-->…<!--/$-->` markers around a reactive text child, so a row ending in text recorded a removed node as its end. That row is now ended at its live last node, and given its own end marker when that node is text.
