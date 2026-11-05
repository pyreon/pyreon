---
'@pyreon/validate': patch
---

Failing parses at the root (a scalar type mismatch or a failed check) are ~25–30% faster: the issue's empty path is a fresh `[]` instead of a `slice()` of the frozen empty-path sentinel. Issues still own a fresh, mutable path array.
