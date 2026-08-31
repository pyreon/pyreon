---
'@pyreon/lint': patch
---

Dedicated specs for the general BE/FE/shared rule tiers, which had shipped
with only fires-invariant fixtures.

The fires-invariant proves a rule CAN fire and stays silent on a clean
counterpart. It says nothing about the branches in between, and the general
tiers were the least-covered code in the package as a result —
`no-locale-dependent-format` at 45% branches, `no-out-of-subset-construct` at
47%, `require-error-cause` at 57%. Five new files (`isomorphic-`, `backend-`,
`portable-`, `js-`, `web-perf-rules.test.ts`) close that, and the negative
cases are written as deliberately as the positive ones: these rules run on
`shared` files, which is most of an app, so a false positive is expensive.

Writing them surfaced three things the fixtures could not:

- **Dead code in `no-locale-dependent-format`.** Its `CallExpression` handler
  carried a `node.type === 'NewExpression'` branch that the walker never
  dispatches there, shadowed by a live `NewExpression` visitor below. Removing
  it leaves every spec green, which is what proves it was unreachable.
- **A false positive in `require-error-cause`.** `AggregateError` is in its
  builtin set, and its only idiomatic form is `new AggregateError([err], msg)`
  — but the positional check looked for a bare identifier and not inside an
  array, so it flagged the correct use of a constructor it claims to support.
- Two of my own assertions were wrong about the rules rather than the reverse:
  a file importing `node:fs` is `server` by PROOF wherever it sits, and an
  explicit `{ passive: false }` is a stated decision the rule deliberately
  respects. Both are now pinned as specs so the contracts are documented.

Package coverage moves 95.01/88.47 to 95.70/90.07 (statements/branches). The
branch threshold was configured at 90 and had been unmet — `bun run test
--coverage` exited 1 before this change and exits 0 after.
