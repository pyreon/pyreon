---
'@pyreon/runtime-dom': patch
---

Faster teardown of lists inside elements. A `<For>` mounted inside a freshly built element no longer removes its rows from the DOM one at a time when it is torn down: the element leaves the document as a unit right after, so those removals were redundant. Every row's cleanup still runs, so effects are disposed and refs cleared. Unmounting a 1,000-row × 6-column table goes from 2.83ms to 1.36ms in Chromium, ahead of memoized react-table (1.88ms).
