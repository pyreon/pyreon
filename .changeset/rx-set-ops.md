---
'@pyreon/rx': minor
---

Completeness additions (39 → 42 transforms):

- **`intersection` / `difference` / `union`** — set operations by identity or by `key` selector, **signal-aware on BOTH inputs** (either input may be a signal; the result recomputes when either changes). `O(n + m)` via a `Set`; `union` is order-preserving (source first, first occurrence wins).
- **`sortBy` direction** — optional third parameter `'asc' | 'desc'` (default `'asc'`, fully back-compatible); descending no longer requires composing `reverse`.
