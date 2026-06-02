---
'@pyreon/machine': patch
'@pyreon/store': patch
'@pyreon/virtual': patch
'@pyreon/kinetic-presets': patch
---

Lock coverage thresholds at ≥95% statements / branches / functions / lines. All 4 packages already measure at 100% on every metric (machine 63/63, store 13/13, virtual 59/59, kinetic-presets 198/198) — this PR just locks the thresholds.
