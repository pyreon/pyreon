---
'@pyreon/table': patch
---

`flexRenderCell` builds a cell renderer's context directly instead of asking table-core for one and then copying it. When a cell's `getContext` returns table-core's core context (checked once per `getContext` function), each cell now costs one object and two closures instead of two objects and four. Other context shapes keep the copying path. In real Chromium, mounting a 1,000 × 6 table went from 31.7 ms to 29.5–29.8 ms (react-table with memoized rows: 28.5–29.4 ms), and replacing all rows from 26.4 ms to 24.7–24.8 ms.
