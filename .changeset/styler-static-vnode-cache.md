---
'@pyreon/styler': patch
---

Pre-build a cached VNode for `StaticStyled` renders that pass no extra runtime props. The empty-`rawProps` + `ref == null` fast path skips the per-render `h()` allocation and prop spread by returning a shared VNode object. Companion to the `onSheetClear`-driven cache reset (separate PR): the cached VNode is invalidated whenever the underlying stylesheet is cleared, so HMR cycles + test resets don't serve stale class names. Mirrors vitus-labs commit. New `styler.staticVNode.hit` perf counter tracks cache utilization.
