---
'@pyreon/compiler': patch
---

Component-child `{props.x}` is now LIVE (fixes #2348): props-backed stable references (props-member reads, splitProps holders, prop-derived consts) emit the `() => expr` accessor in component-child position — the same liveness the identical expression already had as a component attr (`_rp(() => …)`) and under a DOM element (`bindPolymorphicText`). Previously the child was emitted bare, firing the reactive-prop getter once at jsx() time and freezing it. Plain (non-props) stable refs keep the bare emission that protects structural children consumers; both backends byte-identical.
