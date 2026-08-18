---
'@pyreon/permissions': patch
'@pyreon/rich-text': patch
'@pyreon/document': patch
'@pyreon/hotkeys': patch
'@pyreon/machine': patch
'@pyreon/storage': patch
'@pyreon/flow': patch
'@pyreon/code': patch
---

Ship the MIT LICENSE file in the package tarball

These eight published packages were missing a `LICENSE` file. The repo's
own rule has always been that every package carries one ("Every package
MUST have `LICENSE` (MIT) and `README.md` — no exceptions"), but nothing
enforced it, so the gap went unnoticed.

No runtime change. It matters anyway: consumers, vendoring tools and
licence scanners read the file from the tarball, and its absence makes an
MIT-licensed package look unlicensed at the point where that question is
actually asked. A gate now keeps every workspace covered.
