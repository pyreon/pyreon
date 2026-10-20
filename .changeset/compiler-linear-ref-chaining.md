---
'@pyreon/compiler': patch
---

The JSX compiler is now linear in template size. Each child's DOM-walk key used to spell out every sibling hop (`.nextSibling` repeated up to the child's index), so building, hashing and prefix-searching those keys cost O(position) per child, which made large literal templates quadratic. Keys are now one segment per tree level, and the longest-captured-prefix search walks the same candidates in the same order, so emitted code is byte-identical: 1,550 compilations of 775 real `.tsx` files across `examples/`, `docs/` and the UI packages, client and SSR, matched `main` exactly.

Native backend, one large table template:

| rows | before | after |
| --- | --- | --- |
| 100 | 735µs | 610µs |
| 400 | 4.82ms | 2.49ms |
| 800 | 14.3ms | 5.0ms |

The JS fallback is up to 33% faster.
