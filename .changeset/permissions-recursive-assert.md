---
'@pyreon/permissions': minor
---

Fill the genuine gaps in the flat-key reactive permissions model vs CASL (staying in the predicate idiom — not adopting CASL's action/subject/condition DSL):

- **Recursive subtree wildcard `prefix.**`** — `'posts.**'` matches any key at any depth below `posts` (`posts.read`, `posts.a.b.c`), where `'posts.*'` matches only ONE segment. Resolution is now most-specific-first (exact → `parent.*` → nearest-ancestor `**` → global `*`), so an exact or `**` deny overrides a broader subtree grant (`'posts.**': true` + `'posts.admin.**': false` grants posts but denies the admin subtree — the CASL `cannot`-over-`can` shape). Non-breaking: `'*'` stays recursive-everything and `'prefix.*'` stays one-segment; `**` is the new primitive.
- **`can.assert(key, context?)`** — throw-on-deny (`[Pyreon] permission denied: '<key>'`) for route loaders, navigation guards, and server actions; evaluates predicates + wildcards exactly like `can()`. The imperative companion to the reactive `can()` (CASL `ForbiddenError` parity).
- **`can.clear()`** — wipe all permissions reactively (e.g. on logout); equivalent to `can.set({})`.

Out of scope (the predicate model deliberately replaces): MongoDB-style condition matching → predicates; rule packing/serialization + subject-type detection → N/A for the flat-string-key model; async checks → resolve into a signal the predicate reads.

Backward-compatible: all pre-existing tests pass unchanged.
