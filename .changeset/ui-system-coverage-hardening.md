---
'@pyreon/styler': patch
'@pyreon/rocketstyle': patch
'@pyreon/elements': patch
'@pyreon/kinetic': patch
'@pyreon/unistyle': patch
'@pyreon/ui-core': patch
'@pyreon/connector-document': patch
'@pyreon/attrs': patch
---

Internal coverage hardening — documented `v8 ignore` comments on genuinely
unreachable/defensive branches plus a handful of behavior-preserving
restructures (dead `else if` → `else`, a redundant early-return removal, an
extract-variable). No runtime behavior change; verified by the existing node +
real-Chromium browser suites.
