---
'@pyreon/native-compiler': minor
---

PMTC: a declaration with no initializer is no longer dropped, and an enum literal lowers in every expected-type position

`let out: string`, assigned once per branch of an `if`, is ordinary TypeScript
and was **dropped entirely** — the parser returned null for a declarator with no
`init`, so every later assignment named a variable that had never been declared.
On the generated flow geometry that was 40 errors ("cannot find 'path' in
scope", "unresolved reference") from three lines of source, with no warning. A
declaration with no annotation EITHER is still dropped, but now says so: there
is genuinely nothing to declare, and guessing is worse than reporting.

Separately, the string-literal → enum-case rewrite had been added one POSITION
at a time — comparison, then return — and the geometry immediately produced two
more (a `??` default and a struct field). Rather than a third and fourth branch,
it now hangs off `withExpectedType`, which every position that knows its
expected type already threads. A fifth position works without further change.
