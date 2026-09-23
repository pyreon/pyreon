---
'@pyreon/kinetic': patch
---

Withdraw the published speed comparison with Motion One. The benchmark behind it closed its timing window before kinetic's enter-to state was applied (so part of kinetic's work was never timed), its "enter" scenario revealed one element instead of N, and its plain-CSS baseline never started a transition. The harness is fixed; no replacement figure is published until it has been re-measured on a quiet machine.
