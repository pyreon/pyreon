---
'@pyreon/lint': patch
---

The manifest's rule-METADATA claims are now gated, not just its counts.

`registry-drift.test.ts` already locked the group list and the per-group
counts. It did not cover the quieter half: prose that names specific rules and
asserts something about their `meta`. Two such claims exist, both accurate
today and both with nothing keeping them that way:

- `(auto-fixable)` on a named rule. A wrong one sends someone to run `--fix`
  and wonder why nothing changed — and it renders verbatim into the docs site
  and the MCP api-reference, so the claim travels further than the manifest.
- The enumerated list of `meta.scope: 'monorepo'` rules. That list tells a
  consumer which rules EVERY shipped preset forces off. A rule missing from it
  reads as shippable when it is not; a rule still listed after losing the
  marker reads as forced-off when it is live in someone's project. Checked in
  both directions.

Same hand-maintained-list class as the schema group list and the per-group
counts before it — the third and fourth claims in this file to get a lock.
Bisect-verified by injecting a false auto-fixable claim and a phantom
monorepo rule; each fails exactly its own spec.
