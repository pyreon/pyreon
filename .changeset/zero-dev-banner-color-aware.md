---
'@pyreon/zero-cli': patch
---

`zero dev`: honor `NO_COLOR` / `FORCE_COLOR` / `isTTY` in the startup banner, so piped output (`bun run dev > log`, CI, `bun run --filter`'s boxed capture) stays clean plain text instead of leaking raw ANSI escape codes.
