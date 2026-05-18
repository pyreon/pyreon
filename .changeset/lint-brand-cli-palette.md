---
'@pyreon/lint': patch
---

`pyreon-lint` text output now follows the Pyreon brand handoff (#651) — CLI spec §6.5 — matching the `pyreon doctor` change.

New self-contained `lint/src/ansi.ts` (mirrors `@pyreon/cli`'s `doctor/render/ansi.ts`; no shared module — both are separate published packages that deliberately avoid a runtime ANSI dependency). Brand tokens map to their nearest **xterm-256** index, emitted as 8-bit SGR (`38;5;N`) — the handoff mandates *"256-color terminal palette must survive (no truecolor-only colors)"*, so there is no `38;2;r;g;b`. Mapping: error→ember-core `#FF5E1A` (202), warning→ember-warm `#FFC83D` (220), info→cyan `#22D3EE` (45); severity glyphs `✗` / `!` / `ℹ` per §6.5; file path `bold`, loc/ruleId `dim`. Ember stays scarce by construction (only the error + warning severities), as the brand mandates.

Also closes a pre-existing correctness gap: `reporter.ts` previously emitted raw ANSI (`\x1b[31m`) **unconditionally** — colored output even when piped to a file or under `NO_COLOR`. `ansi.ts` adds the standard gate (`NO_COLOR` → off, `FORCE_COLOR=0/set` → off/on, else `process.stdout.isTTY`), parity with the doctor renderer.

`--format json` and `--format compact` are untouched (machine formats, never colored). Verified: dependency-free proof the emitted codes are exactly `38;5;{202,220,45}` with zero `38;2` truecolor, and `NO_COLOR` yields plain text; `@pyreon/lint` reporter tests 10/10 pass; oxlint clean.
