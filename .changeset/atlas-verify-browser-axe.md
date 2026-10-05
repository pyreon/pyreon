---
"@pyreon/atlas": patch
---

`atlas verify-browser` now actually runs axe-core. Each scenario's live preview is audited in the page and the result is merged into the catalog's `a11y` verdict (violations fail it with `axe-violation` findings, axe's needs-a-human items surface as `axe-incomplete`, a run that cannot happen is a skip with its reason, never a pass; the scan's static name check is kept and re-runs replace prior axe findings). Previously the static a11y verifier told users to run `verify-browser` for axe coverage that the browser runner never performed. `--no-axe` opts out and `--axe-min-impact <level>` filters by impact; the CLI summary states whether axe ran. Violations do not change the exit code.
