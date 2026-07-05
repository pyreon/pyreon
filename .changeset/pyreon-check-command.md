---
"@pyreon/cli": minor
---

Add `pyreon check [paths]` — a fast, file-scoped anti-pattern scan that runs the compiler's static detectors (`detectPyreonPatterns` + `detectReactPatterns`) over source files and prints each finding with its inline fix. With no path args it scans the git-changed `.ts`/`.tsx` files (the pre-commit inner loop); pass explicit files/dirs to scope it anywhere. Exits non-zero on findings, so it doubles as a pre-commit / CI gate. `--fix` applies the mechanically-safe auto-fixes (`migratePyreonCode` + `migrateReactCode`) in place; `--json` emits machine-readable findings.

It's the terminal-native twin of the MCP `validate` tool — distinct from `pyreon doctor` (whole-project health + gates, slower) and `pyreon lint` (the `@pyreon/lint` rule set).
