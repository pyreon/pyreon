---
'@pyreon/cli': minor
'@pyreon/lint': minor
'@pyreon/zero-cli': patch
'@pyreon/zero': patch
'@pyreon/lathe': patch
'@pyreon/atlas': patch
'@pyreon/loom': patch
'@pyreon/native-cli': patch
'@pyreon/mcp': patch
'@pyreon/create-zero': patch
'@pyreon/create-multiplatform': patch
---

Every Pyreon command now prints in the shared terminal theme, and the theme gains a 256-colour level.

- New flags: `pyreon check --gha` and `pyreon-lint --format gha` print one GitHub Actions annotation per finding. `@pyreon/lint` also exports `formatGha` and the `TermChoice` type.
- 256 colours: a terminal that advertises 256 colours but not truecolor (`TERM=xterm-256color`, macOS Terminal, `FORCE_COLOR=2`) now gets the nearest xterm-256 colour for each role instead of 16 colours. Every index keeps at least 4.5:1 contrast on dark and light backgrounds. Colour-level options that took `0 | 1 | 2` (where 2 was truecolor) now take `0 | 1 | 2 | 3`: 2 is 256 colours and 3 is truecolor, the numbering `FORCE_COLOR` uses. `FORCE_COLOR=1|2|3` is a minimum: a terminal that advertises more keeps it.
- Migrated: `pyreon check`, `plain`, `add`, `context` and the usage errors; `pyreon-lint --list`, `--why-off`, `--init` and watch mode; `zero dev` and the failure output of every `zero` command; the zero build's route-mode table and perf advisor; `lathe pull` and `--watch`; usage errors in `pyreon-native`, atlas and loom; `loom build` and `loom dev` status lines; create-zero's argument and fatal errors; the MCP server's fatal error.
- States the reference did not show: an empty run ends on `ℹ` (never `✓`), a run stopped with Ctrl-C ends on `! interrupted · elapsed` and exits 130 (watch modes end on `ℹ stopped watching` and exit 0), and a table that does not fit a narrow terminal stacks its rows instead of cutting them.
- Lines wrap at the terminal's width, at most 100 columns; `PYREON_CLI_WIDTH` sets it. A verdict too long for the line moves its counts onto an indented line.
- `pyreon-lint --watch` now prints a verdict after a clean re-lint, so a fixed problem no longer stays on screen.
- Every `--json` output is unchanged byte for byte.
