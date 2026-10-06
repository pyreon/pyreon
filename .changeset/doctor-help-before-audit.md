---
'@pyreon/cli': patch
---

Return usage and gate names for `pyreon doctor --help` and `-h` before
validating options or running project audits. Help previously ran the full
audit, making a quick documentation command slow and CI checks unreliable.
