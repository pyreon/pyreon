---
'@pyreon/runtime-dom': patch
---

A `<For>` update that only swaps or rotates a few rows (up to 8 positions, nothing added or removed) now goes straight to moving those rows, without first looking every key up in the row cache twice. About 10 µs less JavaScript per swap on a 1,000-row list.
