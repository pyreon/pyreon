---
'@pyreon/zero': minor
---

`createFsStore` is now bounded like `createMemoryStore`. Behaviour change: a file-store cache keeps at most `maxEntries` entries (default `1000`); pass `createFsStore(dir, { maxEntries })` to change it. It used to keep one file per cache key forever, so distinct query strings could fill the disk.

- Past the cap, the least recently written or read entry is evicted, together with its tags. A new store counts the entries already in `dir` and trims to the cap, so the bound holds across restarts.
- Tags live in a small sidecar per entry instead of one shared `_tags.json`, so a tagged cache miss writes O(1) bytes. An existing `_tags.json` is migrated at start and removed.
- Writes go to a temporary file renamed into place (a crash never leaves a torn entry; leftover temporary files are removed at start), and writes and removals for one key run in call order: concurrent `set`s keep the last value and a later `delete` always wins.
- A key longer than a file name allows, or one containing upper-case letters, is stored under a SHA-256 file name. Long keys used to fail to cache silently, and on a case-insensitive file system `/About` and `/about` shared one file. Existing entries for such keys are re-rendered once.

Upgrade: manual — a file-store cache that should hold more than 1000 entries passes `createFsStore(dir, { maxEntries: n })`; nothing else changes.
