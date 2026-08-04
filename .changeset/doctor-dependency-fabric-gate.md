---
'@pyreon/cli': minor
---

`pyreon doctor` gains a `dependency-fabric` gate, reporting the workspace's own dependency health from `@pyreon/loom`.

The gate adds no dependency. `@pyreon/cli` keeps its two runtime deps and reaches loom the way `pyreon loom` already does — by resolving whatever the project has installed — with one deliberate difference: `pyreon loom` uses `npx --yes`, which fetches when the package is absent (correct, the user typed `loom`), while doctor did not ask for it, so a surprise mid-audit install would be wrong. It resolves the project's own `node_modules` instead and SKIPS when there is none.

Skipping is the honest outcome rather than a convenience: a skipped gate's category is excluded from doctor's mean instead of being scored 100, so a project without loom is never awarded dependency health that was never measured. The skip names the fix (`pyreon add @pyreon/loom`) and says so explicitly.

The scan runs with `--no-write`, so an audit leaves no `loom-report.json` behind in the audited repo, and loom's own severities are carried through unchanged — `unused-dep` stays `info` because it is lexical evidence rather than proof, and promoting it here would turn "verify before removing" into an actionable defect. A scan that fails becomes one `dependency-fabric/scan-failed` warning rather than a crashed audit or a silent clean pass.
