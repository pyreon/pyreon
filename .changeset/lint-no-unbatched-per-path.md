---
'@pyreon/lint': patch
---

fix(lint): `pyreon/no-unbatched-updates` now counts max sets per execution path (was: function-scope sum)

The rule used to sum every `.set()` call in a function and report when the total was ≥3 — but the metric that actually matters for batching is "how many notify cycles can fire on a SINGLE event path." Code with 3 `.set()` calls split across 3 mutually-exclusive branches (if/else-if/else, switch, try/catch) only fires ONE per invocation, yet was incorrectly flagged.

The walker now treats:
- **Sequential statements** → SUM
- **`IfStatement` consequent / alternate** → MAX
- **`SwitchStatement` cases** → MAX
- **`TryStatement` try / catch** → MAX (mutually exclusive on throw path), plus finally (always runs)
- **Loops** → body's per-iteration cost (one iteration is the batch-relevant unit)
- **Ternary / `LogicalExpression`** → MAX (short-circuit)
- **Nested functions** → 0 (separate execution paths handled by their own scope)

Real-corpus impact: the rule flagged 31 sites repo-wide before the fix; 21 after — 10 false positives silenced without missing any real batch candidate. Verified against the canonical false-positive shape (`@pyreon/form` `runValidation` — 3 `errorSig.set()` calls in 3 mutex branches) and the canonical true-positive shape (`setInitialValues` — 4 sets per loop iteration).

Bisect-verified: reverting the walker → the false-positive shape fires again (matches the bug); restoring → it goes silent while the true-positive shape stays flagged.

12 new specs in `rule-batch-2.test.ts` lock in the behaviour:
- 3 false-positive shapes (if/else, switch, try/catch) → not flagged
- 4 true-positive shapes (sequential, in-branch, loop body, mixed mutex+sequential summing to ≥3) → flagged
- Scope isolation: nested arrow fn doesn't pollute outer scope
- batch() wrapper correctly suppresses
- Short-circuit + ternary shapes

Message also clarified: "N signal `.set()` calls can fire on a single execution path" (was: "N signal `.set()` calls without batch()") — names the failure mode the rule is actually catching.
