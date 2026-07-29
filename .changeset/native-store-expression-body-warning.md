---
'@pyreon/native-compiler': patch
---

The concise defineStore setup failed both targets silently — and the warning written for it was unreachable.

    defineStore('app', () => ({ n: signal(1) }))

emitted uncompilable Swift:

    private let useApp = defineStore("app", { ((n: signal(1))) })

referencing `defineStore` and `signal`, neither of which exists in Swift, and
warned about NOTHING. The block-body form immediately next to it lowers
cleanly, so whether an author got working native code or silently broken native
code came down to writing `() => ({ … })` versus `() => { … }`.

The warning for this exact case already existed in `parse.ts` and its text was
correct — it names the block-body form to switch to. It was simply unreachable.
The branch tested `body.type === 'ObjectExpression'`, but a concise-object arrow
body parses as a `ParenthesizedExpression`, and those parens are MANDATORY
syntax (`() => { … }` would be a block). The condition was therefore false for
every input that could ever reach it: dead from the moment it was written, with
the shape falling through to a silent `else { return null }`.

Verified against the real parser rather than reasoned about — for this source
oxc-parser reports `arrow.body.type === 'ParenthesizedExpression'`.

Fix is to unwrap before the branch, with `while` rather than `if` since `(( … ))`
is legal and nests.

SCOPE CHECKED, not assumed: this is the only site in `parse.ts` testing for a
concise-object arrow body. The other `body?.type` checks look for
`BlockStatement`, which is never parenthesized, and one site at line ~6154
already unwraps parens correctly.

RESIDUAL, stated plainly because the build still fails after this change: the
emit remains uncompilable passthrough. That is PRE-EXISTING and identical on
every defineStore bail path — the non-shorthand-key bail, which has warned since
v2, emits the same passthrough. This change brings the expression-body form to
parity with those paths: a NAMED failure carrying a fix instruction rather than
a silent one. Removing the passthrough is a separate change across all bail
paths and would not make the build pass either, since the component still
references the store — so the warning is the load-bearing signal either way.

Bisect-verified: reverting the unwrap fails the four warning specs with
`expected [] to have a length of 1` (zero warnings — the silent failure), while
both block-body guard specs stay green, proving they do not pass merely because
of the fix. Restored, 6/6 pass, and all four store suites are green (35 tests).
