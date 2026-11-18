---
'@pyreon/atlas': patch
---

`atlas scan --check` and `atlas verify --check` no longer exit 1 for failures the committed catalog already has. They printed "no change in any check" and then failed anyway, which blocked adopting the ratchet on a catalog with any failure. `--check` now exits non-zero on a regression, or on a failure the baseline did not have (a failing new scenario included), and it says how many inherited failures it carried over.
