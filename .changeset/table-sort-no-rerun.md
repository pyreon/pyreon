---
'@pyreon/table': patch
---

Sorting a table no longer re-runs every cell. A sort moves the same rows into a new order, and `<For>` moves their DOM, so `useTable` now bumps only rows whose data or row object changed instead of every row. A flat sort re-runs no cells. In real Chromium, sorting 1,000 rows × 6 columns went from 23.0–23.5 ms to 19.2–19.3 ms, which puts it ahead of react-table with memoized rows (20.8 ms) instead of 1.07–1.13× behind.
