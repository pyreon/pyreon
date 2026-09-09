---
'@pyreon/table': patch
---

`createTableState` no longer renders a blank page when the data shrinks, and empty cells sort as one rank

Two fixes to the dependency-free table-state core, both mirrored into the
co-located Swift and Kotlin ports so web, iOS and Android stay 1:1.

**The page could fall off the end of the data.** `setFilter` resets to page 0,
but nothing else did — and a filter is not the only way the row set gets
smaller. Deleting rows, or a refetch returning fewer, left the page pointing
past the end: `rows()` sliced an empty window and the table rendered NOTHING,
while `pageCount()` cheerfully reported a smaller number than `page()`.
`page()` is now derived and clamped against the live row count, so the three
can never disagree. Deriving rather than writing the signal back has a
deliberate consequence: a transient shrink — a filter typed and cleared, a
refetch — returns the reader to where they were instead of stranding them on
the last page.

**`null` and `undefined` were ranked against each other.** Both hit the same
`a == null` arm, so the comparator answered "a before b" to `(null, undefined)`
AND to `(undefined, null)`. A sort given a comparator that claims two rows each
precede the other is free to reorder them, so rows with empty cells shuffled
for no reason and the result depended on where they sat in the input. They are
now one rank — which is also what the native ports already did, since their
`PyreonCell` has a single `.none` case.
