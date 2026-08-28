---
'@pyreon/native-compiler': minor
---

`<Image fit>` now applies to a REMOTE `src` on iOS. It applied to bundled assets
and silently did nothing for a url — one prop, one platform, two answers
depending on the shape of an unrelated attribute, while Kotlin implemented both.

Two more divergences fixed with it: `fit="fill"` mapped to `.scaledToFill()`,
which crops (that is `cover`) where CSS `fill` and Kotlin's
`ContentScale.FillBounds` both distort; and a remote image with no `fit` rendered
at intrinsic size on Swift while web and the bundled branch both default to
`cover`.
