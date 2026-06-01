# @pyreon/ansi

> **Private — internal to the Pyreon monorepo. Not published to npm.**

Single canonical brand-palette ANSI wrapper for every Pyreon CLI surface. Replaces the previously-duplicated `packages/tools/lint/src/ansi.ts` + `packages/tools/cli/src/doctor/render/ansi.ts`. Bundled into each consumer's published `lib/` via `vl_rolldown_build` (no runtime workspace lookup at install time on npm).

## Why

Both files shipped the same brand-token-to-xterm-256 mapping with the same gating logic — only the CLI's version added OSC-8 hyperlink helpers on top. Drift between the two was a real risk: any handoff update (palette swap, new severity level, glyph change) needed two synchronized edits. The shared module collapses to one source.

## Exports

| Export | Purpose |
|---|---|
| `colorEnabled` | Boolean — result of the `NO_COLOR` / `FORCE_COLOR` / `isTTY` gate, computed once at module load. |
| `bold(s)` / `dim(s)` | Style wrappers (SGR `1` / `2`). |
| `red` / `green` / `yellow` / `blue` / `magenta` / `cyan` / `gray` | xterm-256 brand-palette color wrappers. |
| `emberCore` / `emberWarm` | Brand-token aliases for `red` / `yellow` — same identity, kept for the lint reporter's intent-documenting call sites. |
| `SEVERITY_GLYPH` | `{ error: '✗', warning: '!', info: 'ℹ' }` — handoff §6.5 status symbols. |
| `hyperlink(text, url)` | OSC-8 clickable link. iTerm2 / WezTerm / kitty / VSCode render as link; other terminals show the visible text. |
| `fileUrl(path, line?, column?)` | Build a `file://` URL with optional `#L<line>` suffix (VSCode-compatible). |

## Brand palette → xterm-256

Source: the Claude Design brand handoff (committed in #651; CLI spec §6.5 / `pyr doctor` §6.6). Brand colors are 24-bit hex, but the handoff is explicit: **"256-color terminal palette must survive (no truecolor-only colors)."** Every brand role is mapped to its nearest xterm-256 index and emitted as an 8-bit SGR (`38;5;N`).

| brand token | hex | 256 | role |
|---|---|---|---|
| ember-core | #FF5E1A | 202 | errors / fail grade / `✗` |
| ember-warm | #FFC83D | 220 | warnings · hints · `!` |
| ember-plasma | #FF1F8C | 198 | reserved accent |
| ok-green | #4ADE80 | 78 | pass / grade A / `✓` |
| cyan | #22D3EE | 45 | info · links · prompt `$` |
| muted-2 | #8A8696 | 245 | separators · headings · skipped |

Ember stays scarce by construction — only error / fail states + the worst grade, never decoration.

## Color-enabled gate

- `NO_COLOR` — off (de-facto standard).
- `FORCE_COLOR=0` — off; `FORCE_COLOR=<anything else>` — on.
- Otherwise: `process.stdout.isTTY`.

Computed once at module load — re-importing won't re-evaluate. CI runners (GitHub Actions etc.) usually have `isTTY === false`, so color is off by default in CI; set `FORCE_COLOR=1` to override for log readability.

## No runtime dependency

Deliberately no `chalk` / `kleur` / etc. The escapes are tiny and stable; downstream Pyreon CLI packages stay zero-dep at the runtime layer. The dependency surface is a small constant per consumer regardless of how many color helpers they import.

## License

MIT (private to the Pyreon monorepo).
