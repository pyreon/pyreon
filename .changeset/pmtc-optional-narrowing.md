---
'@pyreon/native-compiler': minor
---

`x === undefined ? fb : x` (and the `!==` mirror) rewrites to nil-coalescing
— `(x ?? fb)` on Swift, `(x ?: fb)` on Kotlin.

TS narrows the ternary; Swift does not, so the straight emit failed "must be
unwrapped" on every optional-with-default read. The idiom IS nil-coalescing,
and one shared pattern definition claims the same ternaries on both backends.
The rewrite fires only when the surviving branch is STRUCTURALLY the checked
expression; a provably non-optional check is skipped, while an
unknown-typed one rewrites — the rewrite is value-preserving either way, and
the failure modes are asymmetric (a non-optional coalesce is a warning, a
missing unwrap is an error).
