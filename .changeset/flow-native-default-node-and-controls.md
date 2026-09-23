---
'@pyreon/flow': patch
'@pyreon/native-compiler': patch
---

Native flow nodes and Controls now look like the web ones. A node without a custom `type` rendered on iOS and Android as a bare text label, and Controls used the platform's filled buttons. Five palette colours were declared but never painted: node background, node text, node border, node selected and control colour.

Both native runtimes add `PyreonFlowDefaultNode`, which matches the web's default node: palette colours, a 2px border that uses the selected colour while selected, 6px corners, 8×16 padding, 13px text and an 80px minimum width. The compiler emits it for untyped nodes. Native Controls now use the web's bordered panel box with 28px transparent buttons drawn in the control colour. A new test keeps the native palettes equal to the web's `--pyreon-flow-*` values.
