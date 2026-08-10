---
'@pyreon/atlas': minor
---

**`atlas verify <Component>` — the write → verify → fix loop, and a scan that says WHICH check failed.**

A scan reported `41 verified, 2 failing`. That counts *scenarios*, and it withholds the finding: six checks run per scenario, and the one that failed is the whole content of the message. Answering "which check?" meant opening `atlas-catalog.json` and walking it by hand.

- **Every run now prints a per-check tally** — `checks: a11y 18/20 ✗ · interaction 43/43 · ssrParity 43/43 · leak 43/43` — plus `not run:` lines naming the checks that were unavailable and why. This is not cosmetic: on a package where `@pyreon/runtime-server` does not resolve, the scan reports **1090 of 1090 scenarios verified** having run two of the six checks. True, and completely misleading without the tally.
- **A failing scan now prints the failing CHECK and its findings**, not a bare list of scenario ids. Capped at 20 rows on a whole-catalog scan, and the cap reports itself.
- **New `atlas verify [Component] [--cwd <dir>] [--json]`.** Discovery still walks the project — a component's file is not known until it does — but decoration and verification run only for the match. Measured on `@pyreon/ui-components` (108 components, 1090 scenarios): 1.35s full scan against 0.90s scoped to one component's 60 scenarios; the verify work drops ~18× while discovery dominates the residual, so it is a focus tool first and a speed tool second. Failing scenarios print uncapped. `--json` emits the report as data for an agent to branch on.

Three refusals in `atlas verify` are deliberate. It **never writes `atlas-catalog.json`** — a one-component catalog would replace the real one and silently break the agent guide, the MCP tools and `atlas check` for everything else. An **unmatched name exits non-zero** with suggestions, because filtering to nothing otherwise reports "0 scenarios, 0 failing", which reads as a pass. And a run where **nothing could be verified exits non-zero** too: zero failures is not a pass when zero checks ran.

**Load errors are classified instead of blanket-blamed.** `virtual:zero/routes` is a module a build plugin synthesises; the import is correct and unresolvable only because Atlas does not run that plugin. Every scan of every zero app printed "fix the import and re-run" for it. Those are now reported separately, as "nothing to fix" — while still stating that a component defined in such a file would be absent, which is the half that remains true. A genuinely broken import keeps the loud, actionable message.

**Fixes a pre-existing arg-parsing bug**: `--cwd` was missing from the value-flag set, so any command reading a positional alongside it took the *path* as that positional. `atlas check Button --cwd ./ui` parsed `./ui` as the component's args JSON and reported "could not parse the args" for a command line that is entirely correct.

`CHECK_KEYS` and `CheckKey` are now exported from the plugin registry as the single owner of the check list, so a seventh check cannot be merged into verdicts while going uncounted in the report.
