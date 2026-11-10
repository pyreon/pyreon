---
'@pyreon/core': patch
'@pyreon/reactivity': patch
'@pyreon/runtime-dom': patch
---

Mounted components retain less memory. A component that registers no lifecycle hook shares one frozen hooks object instead of allocating its own, a component with no unmount work returns a small unmount closure instead of keeping its whole mount context alive, and render bindings register their disposer with the scope directly instead of through a `{ dispose }` wrapper. On a 2,047-component tree this is about 74 bytes less retained per component (−14 to −17%).
