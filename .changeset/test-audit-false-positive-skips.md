---
'@pyreon/compiler': minor
---

`auditTestEnvironment` no longer reports two false-positive HIGH findings, and the
"zero HIGH/MEDIUM" invariant is now asserted instead of merely documented.

Two file classes carry `{ type, props, children }` literals that are not Pyreon VNode
mocks, so the "no `h()` import" signal was structurally inapplicable:

- `*.types.test.ts(x)` — type assertions never render; the literal is a cast used to
  obtain a value of the type under assertion, so "add a real `h()` test" is not a fix.
- `@pyreon/document` tests — `DocNode` is that package's own tree format which happens
  to share the shape. Those tests call the REAL `Document`/`Page`/`Text` constructors
  and the real `render`; there is no `h()` anywhere in the package to import.

`.claude/rules/test-environment-parity.md` specifies the pre-merge guard as "verify
HIGH + MEDIUM count is still 0", and the scanner's own test file recorded that T1.2
achieved it — but nothing asserted it, so the count drifted back to 2 unnoticed. A
documented invariant with no test is a convention, not a guard; the real-repo count is
now locked at zero and names the offending paths on failure.
