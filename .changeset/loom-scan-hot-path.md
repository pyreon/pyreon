---
'@pyreon/loom': patch
---

`loom scan` is ~2.1x faster — 0.60s → 0.29s on this 143-package monorepo, measured end-to-end through the shipped bin under node, with byte-identical output (234 findings, identical stats).

Phase timing put 98% of the run in one place: the source-import scan. Two changes there account for it.

`stripWithMask`, the per-file lexical pass, called a `push()` closure once per CHARACTER — one closure call, one rope concat, and one `boolean[]` push each, with V8 storing that array as oddball pointers at 8 bytes per character. It now scans forward to the next character that can change lexer mode and moves whole runs with one slice plus one `Uint8Array.fill`. Same state machine, same transitions, same output: proven byte-for-byte against the original implementation over every source file in this repo, which is a far harsher corpus than any fixture (JSX, regex-heavy code, template literals carrying whole `import … from '…'` lines as prose).

File discovery now asks the OS what each entry is (`withFileTypes`) instead of inferring from the name. The inference it replaced — "no dot in the name means directory" — was wrong in both directions, and one direction was a silent correctness bug: a directory with a dot in its name (`src/v1.2/`) was never descended into, so its source went unscanned and any dependency only it imported was reported as `unused-dep`.
