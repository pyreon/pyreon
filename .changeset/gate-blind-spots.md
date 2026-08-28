---
'@pyreon/cli': patch
---

`doctor --only doc-claims` went blind on JSON claim files.

The claim patterns are written against what a reader SEES, but the gate matched
them against raw file BYTES — and JSON has more than one legal text
representation of the same string. A manifest storing its em dash as the literal
escape `—` made a pattern containing the real character match nothing, so
the claim degraded to a `pattern-miss`, which is ADVISORY. A stale count then
sits behind a passing gate.

Worse, the verdict depended on which tool last wrote the file: `changeset
version` parses and re-serialises every manifest, so the same claim passed on one
branch and hard-failed on another. `.json` claim files now have their escapes
decoded before matching, which makes `@pyreon/lint`'s published npm description
— the real instance — checked rather than skipped.
