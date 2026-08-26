---
"@pyreon/rich-text": patch
---

perf(rich-text): derive the three document counters from a single walk

`characterCount`, `wordCount` and `isEmpty` each ran an independent full
depth-first walk of the ProseMirror JSON on every keystroke — `isEmpty` re-ran
the character walk a *third* time just to test `=== 0`. A live word/char status
bar therefore paid two-to-three full document walks (plus their per-walk string
allocations) per keystroke, scaling with document size.

They now derive from one `computeStats` pass. It reuses `collectBlockTexts`, so
the word semantics are byte-identical (marks joined without a separator; block
boundaries never merge words); `chars` is the sum of the block-string lengths —
exactly the old `countChars`, because every text node's parent is a textblock,
so summing per block equals summing every text node. Each counter keeps its own
value gate, so a change that moves only `words` still re-fires only
`wordCount`'s consumers.

Adds a 500-document differential fuzz locking the single pass byte-identical to
the three original formulas (nested containers, mark-split blocks,
whitespace-only / empty text, headings). Bisect-verified: a no-separator block
merge (the classic single-pass hazard) fails it (`words seed=3: expected 17 to
be 21`).
