---
'@pyreon/mcp': patch
---

The `get_anti_patterns` compact index clamps a title longer than 120
characters on a word boundary and marks it with `…`; `name` lookup strips a
trailing `…`, so any fragment copied from the index still resolves. The
catalog's titles carry the whole claim and had pushed the hook-free index to
its 12,000-token single-response boundary (12,005 with one more entry), where
no new anti-pattern could be filed. Chosen over pagination so the discovery
path stays one call.
