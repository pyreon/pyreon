# @pyreon/ansi

> **Private — internal to the Pyreon monorepo. Not published to npm.**

The one terminal look for every Pyreon command: palette, symbols, capability detection and layout helpers. Consumers list it as a devDependency; `vl_rolldown_build` inlines it into their published `lib/`, so nothing resolves it at install time.

Because it is inlined and has no built declarations, **no published `.d.ts` may name one of its types**. A public options type takes primitives (`color?: 0 | 1 | 2 | 3`, `theme?: 'dark' | 'light'`, `unicode?: boolean`) and builds the `Term` internally (see `@pyreon/lint`'s `formatText`).

## The six rules

`RULES` in `src/palette.ts`, from the CLI design (`Terminal.html`):

1. First line says what ran (bold name · dim context). Last line is the verdict, with counts and elapsed time.
2. Two-space indent; label column padded to the longest label; numbers right-aligned.
3. Every coloured state also has a symbol and a word. `NO_COLOR` output is complete.
4. Every finding: symbol · gate/rule · message, then `↳ file:line:col`, then `fix: <change>`.
5. Human text for people, `--json` for tools, `--gha` for GitHub annotations. Never parse the text.
6. Wrap at 100 columns; never truncate paths.

## Palette

| role | dark | light | 256 dark | 256 light | 16-colour | used for |
|---|---|---|---|---|---|---|
| `accent` | `#FF5E1A` | `#B43A0E` | 202 | 160 | 31 | prompts, active choice, `▸` steps (never a state) |
| `ok` | `#4ADE80` | `#15703A` | 78 | 22 | 32 | `✓`, grade A, up to date |
| `warn` | `#FACC15` | `#8A5A00` | 220 | 94 | 33 | `!`, warnings, budgets |
| `err` | `#F87171` | `#B91C1C` | 203 | 124 | 31 | `✗`, errors, breaking |
| `info` | `#22D3EE` | `#0A6E89` | 45 | 24 | 36 | `ℹ`, file paths (OSC 8 links) |
| `dim` | `#8A8696` | `#5E5A69` | 103 | 59 | 90 | metadata, timings, hints |
| `gray` | `#7E7A8C` | `#6E6A78` | 244 | 242 | 90 | bar tracks, frames |

`EMBER` (plasma / core / warm) is the brand ramp, for decoration only (256: 198 / 202 / 221).

The 256 indexes are fixed entries 16–255 (0–15 belong to the user's theme). Each is the CIEDE2000-nearest entry to the truecolor value among those that keep the role's contrast on the design's terminal background (`BACKGROUND`: `#0B0B10` dark, `#FBF8F1` light): 4.5:1 for text roles, 3:1 for `gray`. Dark `gray` takes its second-nearest entry so it stays distinct from `dim`. `src/tests/palette-256.test.ts` recomputes every choice.

## Detection

| | rule |
|---|---|
| colour level | `NO_COLOR` (non-empty), `TERM=dumb`, `FORCE_COLOR=0\|false` → 0. Not a TTY and not forced → 0. `COLORTERM=truecolor\|24bit`, a `*-direct` TERM or Windows Terminal (`WT_SESSION`) → 3 (truecolor). A `TERM` containing `256` (`xterm-256color`) → 2 (256 colours). Otherwise 1 (16 colours). `FORCE_COLOR=1\|2\|3` turns colour on for a pipe and is a floor: the level is at least its value, more if the terminal advertises more. |
| width | The stream's `columns`, capped at 100 and never below 40; 100 when it reports none (a pipe). `PYREON_CLI_WIDTH=<n>` wins. |
| theme | `PYREON_CLI_THEME=light\|dark` wins; else `COLORFGBG` background 0–6 or 8 is dark, other values light; default dark. |
| symbols | `PYREON_CLI_SYMBOLS=ascii\|unicode` wins; else the first of `LC_ALL`, `LC_CTYPE`, `LANG` must name UTF-8; with no locale only `TERM=linux` is ASCII. Windows: Windows Terminal, VS Code, ConEmu, any `TERM`, or CI. |

## Exports

| Export | Purpose |
|---|---|
| `term` | The `Term` for `process.stdout`, detected once at load. |
| `createTerm(opts)` | A `Term` for given (or detected) `level`, `theme`, `unicode`, `width`. Methods: `paint(role, s)`, one per role (`ok`, `err`, …), `bold`, `underline`, `ember(tone, s)`, `sym(name)`, `link(text, url)`. Level 0 emits no escape at all, links included. |
| `detectColorLevel` / `detectTheme` / `detectUnicode` / `detectWidth` | The pure detection functions above. |
| `CLI_PALETTE`, `EMBER`, `SYMBOLS`, `RULES`, `BACKGROUND` | The design tokens. `xterm256Rgb(i)` gives a 256 index's RGB. |
| `header(t, name, context?)` | Rule 1 first line. |
| `verdict(t, status, text, meta?)` | Rule 1 last line: `✓ text · meta · meta`. |
| `formatCounts(t, { errors, warnings, infos })` | `1 error, 5 warnings, 2 info`, zeros left out. |
| `meta(t, parts)`, `plural`, `formatElapsed` | ` · a · b` in dim, `2 errors`, `380 ms` / `1.4 s`. |
| `columns(rows, { align, gap, indent, width })` | Rule 2: pad by visible width, right-align marked columns. With `width`, a table that does not fit stacks (first cell, then the rest indented) instead of cutting anything. |
| `interrupted(t, meta)` | Ctrl-C last line: `! interrupted · 3 of 13 gates · 2.1 s`. |
| `nothingTo(t, what, hint)` | Empty-run last line: `ℹ no changed files · pass paths: …` (never `✓`). |
| `onInterrupt(render, opts)` | One-shot SIGINT handler: prints `render()` to stderr and exits 130. Returns the disposer. |
| `ghaAnnotation`, `ghaLevel`, `ghaEscape`, `ghaProperty` | `--gha` workflow-command lines, escaped per GitHub's rules. |
| `finding(t, f, { indent, width })` | Rule 4 block, message and fix wrapped with a hanging indent. |
| `formatLocation(t, loc)` | `path:line:col` in `info`, underlined, OSC 8-linked when `abs` is known. |
| `bar(t, value, max, role, width)` | Score bar with a gray track. |
| `frame(t, { title, lines }, indent)` | `╭─[ title ]` / `│` / `╰─` code frame (`+-[`, `\|`, `+-` in ASCII). |
| `wrap(text, width, firstWidth, indent)` | Rule 6: breaks at spaces only, so a path is never split. |
| `stripAnsi`, `visibleWidth`, `padEndVisible`, `padStartVisible`, `fileUrl` | Width-aware helpers. |

## States the design does not draw

| state | output |
|---|---|
| empty run | `ℹ <nothing found> · <hint>` via `nothingTo`. Info, never `✓`: an empty scan proves nothing. Exit 0. |
| warnings only | `! N warnings · meta`. Exit 0 unless the command has a strict mode. |
| interrupted | `! interrupted · <how far> · <elapsed>` on stderr, exit 130 (`onInterrupt`). |
| piped / not a TTY | Level 0 (no escapes, no OSC 8 links), width 100, no screen clearing, same lines otherwise. Symbols follow the locale. |
| narrow (< 60 columns) | Text wraps at the window width (never below 40); tables stack (`columns({ width })`); paths are never cut. |
| usage error | `✗ <cli> · <problem>` then `fix: <the flag or command to use>` (`finding` with indent 0), exit 1 (2 where the CLI already used 2). |

Every helper returns strings and never prints. `src/tests/ansi.test.ts` snapshots a specimen of all of them at each colour level, on both backgrounds, with Unicode and ASCII.

## No runtime dependency

No `chalk` / `kleur`: the escapes are small and stable.

## License

MIT (private to the Pyreon monorepo).
