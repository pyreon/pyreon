---
'@pyreon/flow': patch
---

`await flow.layout()` now resolves once the layout is applied and visible — after the last animation frame — instead of before the default animation moved any node, so `await flow.layout(); flow.fitView()` fits the laid-out graph. A later `layout()` or `dispose()` supersedes a running layout: the earlier promise resolves, its animation stops (it no longer overwrites a later `animate: false` layout), and a superseded layout whose computation finishes late is not applied. Without animation frames (SSR, Node) the animated default applies the final positions at once instead of never moving the nodes.
