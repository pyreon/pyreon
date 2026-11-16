---
'@pyreon/cli': patch
---

`pyreon doctor --full`: the `bundle-budgets` gate reads each package's size ceiling from `scripts/size-budgets/packages/` (one file per package) instead of the single `scripts/bundle-budgets.json`, and its fix hint names the scoped `--update=<package>` command.
