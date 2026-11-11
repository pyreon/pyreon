---
'@pyreon/reactivity': patch
---

Fix a stale read inside `batch()`: a computed read after a write in the same batch could return its old value when it sat below a computed that also feeds an effect (subscribed first), has a direct DOM binding, or uses `{ equals }`. Those computeds are now marked "check" and re-validate on read without re-running unless an input really changed. Also trims a computed's retained heap (689 B → 672 B with its signal on Node).
