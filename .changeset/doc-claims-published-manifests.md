---
'@pyreon/cli': patch
---

`pyreon doctor` doc-claims now counts only published packages when it compares the "N of M published packages have a manifest" claim, so an unpublished (private) package with a manifest no longer skews the derived exempt count.
