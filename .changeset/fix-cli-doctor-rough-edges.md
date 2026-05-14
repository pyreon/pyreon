---
'@pyreon/cli': patch
---

`pyreon doctor` v2 — two rough-edge fixes surfaced by real-app testing.

**lint gate emitted absolute paths.** Every lint finding's `location.relPath`
held the full absolute path from `fileResult.filePath` instead of a path
relative to the doctor's `cwd`. Reports rendered as
`/Users/.../packages/tools/react-compat/src/index.ts:830:4` instead of
`packages/tools/react-compat/src/index.ts:830:4` — long, leaked the user's
home directory, broke OSC-8 hyperlink alignment. Fix: route through
`path.relative(opts.cwd, fileResult.filePath)`.

**doc-claims gate flooded non-Pyreon projects with spurious errors.** The
gate hardcodes Pyreon-monorepo-specific claim sites
(`packages/fundamentals/hooks/README.md`, `CLAUDE.md`,
`docs/docs/index.md`, etc.) — none of which exist in a downstream consumer
app. Running `pyreon doctor` against a clean project produced 7
`file-missing` errors that blamed the user for paths the gate had no
business asserting. Fix: pre-check whether ANY of the gate's claim files
exist; if zero do, return `meta.skipped: true` with
`skipReason: 'no claim sites found in this project (gate targets Pyreon
monorepo paths)'`. The aggregator then excludes documentation from the
score mean rather than counting it as 0/100.

Test coverage: the original "emits file-missing when claim file absent"
test was tightened to plant one claim file first (so the gate doesn't
skip), and a new "skips gate when no claim files exist" test locks the
non-Pyreon-project behavior. 102 tests pass.
