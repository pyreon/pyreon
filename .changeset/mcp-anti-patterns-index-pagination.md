---
'@pyreon/mcp': minor
---

Paginate the `get_anti_patterns` index. The catalog reached 383 entries, where the one-line-per-entry index crossed the 12,000-token single-response boundary its own budget test guards — so every PR that added an entry failed a test about a file it had not made worse. The index now returns 240 entries per page, names the next page in a footer, and takes a `page` argument; an out-of-range page clamps rather than answering empty, and paging is a split, so every entry still appears on exactly one page. Drill-in by `name` and `category` is unchanged.
