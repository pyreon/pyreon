---
'@pyreon/router': patch
---

First-char fail-fast mask for route misses: `resolveRoute` now jumps straight to the wildcard/not-found tail when no non-wildcard route's first segment starts with the path's first character (a 128-slot mask built once per route table) — the first-character fail a radix-tree matcher gets for free. Measured ~3× on the miss→catch-all path (91 → 31ns on the 50-route protocol table), flipping the one remaining find-my-way-led row. Resolution behavior is byte-identical by construction — the mask only skips matching work; `%`-encoded first chars, leading `//`, trailing-slash statics, unicode routes (mask self-disables), and dynamic-first tables (mask self-disables) all keep the full pipeline. Locked by a 24-spec differential suite (masked vs structurally-unmasked table over explicit edges + 300 seeded fuzz paths), bisect-verified via condition inversion.
