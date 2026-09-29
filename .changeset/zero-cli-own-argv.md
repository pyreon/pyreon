---
'@pyreon/zero-cli': patch
---

Drop the `cac` dependency: `zero`'s argument parsing is now a small first-party parser (`src/argv.ts`) over a declarative command table. Behaviour is unchanged — 72 argv cases recorded from `cac` itself before the swap (command dispatch, option coercion, `--no-*`, `--` passthrough, unknown-option / missing-value / unused-argument errors, `--help` and `--version` output) are replayed against the replacement. The only visible difference is that `--help` no longer prints a trailing space after each option description.
