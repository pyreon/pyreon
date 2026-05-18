---
'@pyreon/cli': patch
---

`pyreon doctor` text output now follows the Pyreon brand handoff (#651) — CLI spec §6.5 / `pyr doctor` §6.6.

`render/ansi.ts` maps every brand token to its nearest **xterm-256** index and emits 8-bit SGR (`38;5;N`). The handoff is explicit — *"256-color terminal palette must survive (no truecolor-only colors)"* — so there is no `38;2;r;g;b`; the codes render identically on truecolor terminals and remain correct on 256-only ones. Mapping: `red`→ember-core `#FF5E1A` (202, errors / fail grade / `✗`), `yellow`→ember-warm `#FFC83D` (220, warnings · hints · `!`), `green`→ok-green `#4ADE80` (78, pass / grade A), `cyan`→brand cyan `#22D3EE` (45, info · links), `gray`→muted-2 `#8A8696` (245, separators · headings · skipped), `magenta`→ember-plasma (198). Severity glyphs aligned to §6.5: `✗` error, `!` warning (`ℹ` kept for info — the findings list only renders problems, never passes, so the brand `✓` would mislead).

Ember stays scarce by construction, as the brand mandates — it only colors error/fail states and the worst grade, never decoration. No structural/output-shape change; `NO_COLOR` / `FORCE_COLOR` / TTY logic and OSC-8 hyperlinks untouched, so `--json` / `--gha` / `--ci` and all snapshots are unaffected (render tests run `FORCE_COLOR=0`).

Verified: dependency-free assertion that the emitted codes are exactly `38;5;{202,220,78,45,245,198}` with zero `38;2` (truecolor) sequences; `@pyreon/cli` render tests 14/14 pass; oxlint clean.
