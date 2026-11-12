---
'@pyreon/compiler': patch
---

The test-environment audit no longer counts the member list of an `interface` or `type` alias (`type`, `props`, `children`) as a mock-vnode literal: it declares a shape, it is not a value standing in for a render.
