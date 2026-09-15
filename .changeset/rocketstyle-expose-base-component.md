---
'@pyreon/rocketstyle': patch
---

Expose the chain's base as a `__rs_component` static (a tag string for `.config({ component: 'hr' })`, otherwise the wrapped component), beside the existing `__rs_attrs`, so `@pyreon/atlas` discovery can learn what a component renders as when its attrs chain sets no `tag`.
