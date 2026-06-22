---
"@pyreon/validate": minor
---

Add composition combinators to the `s` validator: `union`, `discriminatedUnion`
(O(1) literal-keyed dispatch with precise discriminator errors), `record` (string-keyed
dictionary, prototype-pollution-safe), and `tuple` (fixed-length positional). All are
strictly type-inferred — `union(s.string(), s.number())` → `string | number`,
`tuple([...])` → positional tuple type, `discriminatedUnion` → the exact member union.
Closes the largest feature gap vs Zod/Valibot (unions/records/tuples were the blocker
for modeling most real-world API/domain schemas).
