---
'@pyreon/validate': patch
---

Fix: `.is()` and `.parse().ok` could disagree after a shared child schema was mutated.

Chained methods mutate a schema IN PLACE and invalidate only the schema they were
called on — never its ancestors. That ancestor staleness is long-standing and benign
on its own, because every reader went through one compiled validator and was stale
*together*. The verdict-only JIT introduced a second artifact for the same verdict,
and once the two were built at different moments they could be stale differently:

```ts
const Email = s.string()
const A = s.object({ e: Email })
A.is({ e: 'x' })                 // builds A's verdict function → true
s.object({ e: Email.email() })   // in-place chain mutates the SHARED leaf
A.is({ e: 'x' })                 // stale verdict            → true
A.parse({ e: 'x' }).ok           // freshly compiled         → false
```

The verdict function is now built in the SAME pass as the parse validator, not lazily
on first `.is()`. Invalidating the two together is not sufficient — a verdict compiled
later reads a newer tree than a stale parse validator — so they must come from one
snapshot. `is(x) === parse(x).ok` then holds whether or not either is stale, which is
what the contract actually promises.

Found by adversarial review of the verdict-JIT change, not by the test suite; the
first fix attempt was incomplete and the regression test added for it caught that.
Bisect-verified in both directions.
