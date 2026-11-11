---
'@pyreon/cli': patch
'@pyreon/lint': patch
'@pyreon/zero': patch
'@pyreon/zero-cli': patch
---

`pyreon doctor`, `pyreon-lint` and the `zero build` summary now share one terminal look: one palette in truecolor (dark and light terminals) and 16 colours, plain under `NO_COLOR`, `TERM=dumb` or a pipe, with ASCII symbols when the locale is not UTF-8. `PYREON_CLI_THEME=light|dark` or `COLORFGBG` picks the light palette; `FORCE_COLOR=3` forces truecolor.

- doctor: findings read `✗ gate/rule · message`, then `↳ path:line:col`, then `fix:`; long messages wrap at 100 columns; skipped gates list one per line; the footer says `1 gate`, not `1 gates`.
- lint: file paths are shown relative to the working directory, messages wrap at 100 columns with the rule id kept, rule-option (config) diagnostics are printed instead of being dropped from text output, and a CLI run ends with the fixable count, file count and elapsed time (a clean CLI run prints `✓ no problems`). The watch-mode clear-screen sequence is no longer written to a pipe.
- zero build: the summary header names the mode and adapter, asset paths are never truncated, sizes are right-aligned, and the last line is the verdict (`✓ built in 1.5 s · 82 assets · 13 prerendered pages`). `zero build` no longer prints a separate `Build completed in Nms` after it. The route-mode table is coloured when the terminal supports it.

`--json`, `--gha` and lint's `compact` output are unchanged byte for byte.
