# @pyreon/ansi

> **Private — internal to the Pyreon monorepo. Not published to npm.**

The one terminal look for every Pyreon command: palette, symbols, capability detection and layout helpers. Consumers list it as a devDependency; `vl_rolldown_build` inlines it into their published `lib/`, so nothing resolves it at install time.

Because it is inlined and has no built declarations, **no published `.d.ts` may name one of its types**. A public options type takes primitives (`color?: 0 | 1 | 2`, `theme?: 'dark' | 'light'`, `unicode?: boolean`) and builds the `Term` internally (see `@pyreon/lint`'s `formatText`).

## The six rules

`RULES` in `src/palette.ts`, from the CLI design (`Terminal.html`):

1. First line says what ran (bold name · dim context). Last line is the verdict, with counts and elapsed time.
2. Two-space indent; label column padded to the longest label; numbers right-aligned.
3. Every coloured state also has a symbol and a word. `NO_COLOR` output is complete.
4. Every finding: symbol · gate/rule · message, then `↳ file:line:col`, then `fix: <change>`.
5. Human text for people, `--json` for tools, `--gha` for GitHub annotations. Never parse the text.
6. Wrap at 100 columns; never truncate paths.

## Palette

| role | dark | light | 16-colour | used for |
|---|---|---|---|---|
| `accent` | `#FF5E1A` | `#B43A0E` | 31 | prompts, active choice, `▸` steps (never a state) |
| `ok` | `#4ADE80` | `#15703A` | 32 | `✓`, grade A, up to date |
| `warn` | `#FACC15` | `#8A5A00` | 33 | `!`, warnings, budgets |
| `err` | `#F87171` | `#B91C1C` | 31 | `✗`, errors, breaking |
| `info` | `#22D3EE` | `#0A6E89` | 36 | `ℹ`, file paths (OSC 8 links) |
| `dim` | `#8A8696` | `#5E5A69` | 90 | metadata, timings, hints |
| `gray` | `#7E7A8C` | `#6E6A78` | 90 | bar tracks, frames |

`EMBER` (plasma / core / warm) is the brand ramp, for decoration only.

## Detection

| | rule |
|---|---|
| colour level | `NO_COLOR` (non-empty), `TERM=dumb`, `FORCE_COLOR=0\|false` → 0. Not a TTY and not forced → 0. `FORCE_COLOR=3` or `COLORTERM=truecolor\|24bit` (or a `*-direct` TERM) → 2 (truecolor). Otherwise 1 (16 colours). |
| theme | `PYREON_CLI_THEME=light\|dark` wins; else `COLORFGBG` background 0–6 or 8 is dark, other values light; default dark. |
| symbols | `PYREON_CLI_SYMBOLS=ascii\|unicode` wins; else the first of `LC_ALL`, `LC_CTYPE`, `LANG` must name UTF-8; with no locale only `TERM=linux` is ASCII. Windows: Windows Terminal, VS Code, ConEmu, any `TERM`, or CI. |

## Exports

| Export | Purpose |
|---|---|
| `term` | The `Term` for `process.stdout`, detected once at load. |
| `createTerm(opts)` | A `Term` for given (or detected) `level`, `theme`, `unicode`. Methods: `paint(role, s)`, one per role (`ok`, `err`, …), `bold`, `underline`, `ember(tone, s)`, `sym(name)`, `link(text, url)`. Level 0 emits no escape at all, links included. |
| `detectColorLevel` / `detectTheme` / `detectUnicode` | The pure detection functions above. |
| `CLI_PALETTE`, `EMBER`, `SYMBOLS`, `RULES` | The design tokens. |
| `header(t, name, context?)` | Rule 1 first line. |
| `verdict(t, status, text, meta?)` | Rule 1 last line: `✓ text · meta · meta`. |
| `formatCounts(t, { errors, warnings, infos })` | `1 error, 5 warnings, 2 info`, zeros left out. |
| `meta(t, parts)`, `plural`, `formatElapsed` | ` · a · b` in dim, `2 errors`, `380 ms` / `1.4 s`. |
| `columns(rows, { align, gap, indent })` | Rule 2: pad by visible width, right-align marked columns. |
| `finding(t, f, { indent, width })` | Rule 4 block, message and fix wrapped with a hanging indent. |
| `formatLocation(t, loc)` | `path:line:col` in `info`, underlined, OSC 8-linked when `abs` is known. |
| `bar(t, value, max, role, width)` | Score bar with a gray track. |
| `frame(t, { title, lines }, indent)` | `╭─[ title ]` / `│` / `╰─` code frame (`+-[`, `\|`, `+-` in ASCII). |
| `wrap(text, width, firstWidth, indent)` | Rule 6: breaks at spaces only, so a path is never split. |
| `stripAnsi`, `visibleWidth`, `padEndVisible`, `padStartVisible`, `fileUrl` | Width-aware helpers. |

Every helper returns strings and never prints. `src/tests/ansi.test.ts` snapshots a specimen of all of them at each colour level, on both backgrounds, with Unicode and ASCII.

## No runtime dependency

No `chalk` / `kleur`: the escapes are small and stable.

## License

MIT (private to the Pyreon monorepo).
