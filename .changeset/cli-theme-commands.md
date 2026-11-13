---
'@pyreon/create-zero': patch
'@pyreon/create-multiplatform': patch
'@pyreon/native-cli': patch
'@pyreon/lathe': patch
'@pyreon/loom': patch
'@pyreon/atlas': patch
---

create-zero, create-multiplatform, `pyreon-native`, lathe, loom and atlas now print in the shared Pyreon terminal theme (the one `pyreon doctor`, `pyreon-lint` and `zero build` use): a header line naming what ran, findings as symbol · rule · message with a `↳ file:line:col` line, and a last line that is the verdict with counts and elapsed time. Colour is truecolor on dark or light terminals (`PYREON_CLI_THEME`, `COLORFGBG`), 16 colours otherwise, plain under `NO_COLOR`, `TERM=dumb` or a pipe, and symbols fall back to ASCII when the locale is not UTF-8. Every `--json`, lathe `diff --format github|markdown|json` and LSP payload is unchanged byte for byte.

- create-zero honours `FORCE_COLOR` and `TERM=dumb` (it ignored both), ends with `✓ created <name> · N files · <ms>`, and no longer erases earlier answers on a terminal that reports 0 columns.
- loom: warnings use `!`, findings point at the importing files or the declaring `package.json`, and the verdict is the last stdout line; the CLI no longer calls `process.exit()`, which cut piped output off mid-line.
- lathe: messages wrap instead of being truncated at 120 characters; `--color` / `--no-color` still force colour on and off.
