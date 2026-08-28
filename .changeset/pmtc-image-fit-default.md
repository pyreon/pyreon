---
'@pyreon/native-compiler': patch
---

An `<Image>` with no `fit` now defaults to `cover` on Android, as it already
does on web and iOS. Compose was falling back to `ContentScale.Fit`, so an image
that filled its box on the other two targets letterboxed there — from one
source, with nothing said.
