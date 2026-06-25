---
'@pyreon/cli': minor
'@pyreon/lint': minor
---

cli: add `pyreon lint` — a unified front door to `@pyreon/lint`

`pyreon lint [paths]` forwards every `pyreon-lint` flag verbatim (`--preset`,
`--fix`, `--format`, `--quiet`, `--rule`, `--config`, `--ignore`, `--watch`,
`--lsp`). It exits non-zero on lint errors, just like the standalone binary.

To keep one implementation, `@pyreon/lint` now exports **`runCli(argv): number
| null`** (extracted from its bin's `main()`): returns the exit code, or `null`
for the long-running `--watch` / `--lsp` modes. Both the `pyreon-lint` bin and
`pyreon lint` call it, so the two CLIs can never drift. Lazy-loaded in the
`pyreon` dispatch — no main-entry bundle growth.
