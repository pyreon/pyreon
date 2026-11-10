---
'@pyreon/reactivity': patch
---

Computeds now stop re-evaluating below a value that did not change. A computed reached by a write only through another computed is marked "check" rather than "dirty": reading it first refreshes the computeds it depends on, and it re-runs only if one of them returned a new value. A 10-deep chain under an unchanged gate now costs 0 chain evaluations per write instead of 10. Also fixes a stale read: a computed read inside `batch()` below a computed that also feeds an effect, a direct DOM binding or an `{ equals }` computed could return its old value until the batch ended.
