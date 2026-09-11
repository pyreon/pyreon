---
'@pyreon/cli': patch
---

`pyreon plain --json` now emits JSON on the empty branch.

When no source file matched, the command printed the prose line
`No source files matched.` regardless of `--json` — so the one consumer the
flag exists for got something it cannot parse, and threw
`SyntaxError: Unexpected token 'N'`. "No files matched" is exactly the moment
a script is deciding whether to proceed, which makes it the worst branch to
lose the machine-readable shape on.

It now prints `{ "files": [], "declined": {}, "matched": 0 }` and keeps the
human line for a run without the flag.
