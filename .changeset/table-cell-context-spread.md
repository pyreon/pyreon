---
'@pyreon/table': patch
---

Cell rendering is cheaper. `flexRenderCell` builds an untracked copy of each cell's context on every render, and it copied every property descriptor to do it. table-core builds that context as a plain object of data properties, so a spread gives the same object about 13× faster. Measured on the table benchmark at 1,000 rows: mount 53.5ms → 48.2ms, single-cell update 0.237ms → 0.225ms. A context with any other prototype keeps the descriptor copy.
