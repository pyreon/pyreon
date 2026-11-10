---
'@pyreon/compiler': minor
'@pyreon/core': minor
---

Component props built from constant parent props are no longer re-evaluated through a getter chain. Inside a component, `<Child depth={props.depth - 1} />` now evaluates once when `props.depth` is a plain value (and stays a live getter when it is reactive), and `<Child x={props.x} />` forwards the parent's own getter instead of wrapping it, so a prop threaded through many levels costs one call instead of one per level. Adds the compiler helpers `_pk` and `_pp` to `@pyreon/core` (a newer compiler needs a matching core).
