---
'@pyreon/validate': minor
---

feat(validate): chainable `.toLowerCase()` / `.toUpperCase()` / `.trim()` on StringSchema + coverage hardening (closes BELOW_FLOOR_EXEMPTIONS)

The validator's `core/ops.ts` declared `Op` kinds for `to-lower-case`/
`to-upper-case`/`trim` from v1 (PR #952) but never exposed chainable
methods for them — the gap that drove the temporary `BELOW_FLOOR_EXEMPTIONS`
entry for `@pyreon/validate` at 80/75/80 vs the 90/85/90 fundamentals
floor. This PR ships the missing chainable surface AND lifts coverage
from 83.58 → 98.69% statements / 78.38 → 94.3% branches / 83.21 → 98.6%
functions via 46 additional bisect-targeted tests across the string
transforms + `pipe()` invocation paths + uncovered-but-typed branches
in number/array/object/schema/issue.

What changes for users:

```ts
import { s } from '@pyreon/validate'

// New: declarative case + whitespace transforms — applied before any
// further checks, so `.trim().min(3)` works the way it reads.
const handle = s.string().trim().toLowerCase().min(3)
handle.parse('  Alice  ') // → { ok: true, value: 'alice' }
```

Internally these are `{ kind: 'transform', fn }` ops with the same
compile-once-cached-thereafter contract as `.transform(fn)` — no new
hot-path cost.

Coverage exemption + lowered vitest thresholds removed in the same PR;
`@pyreon/validate` now sits at the fundamentals 90/85/90 floor with
significant headroom.
