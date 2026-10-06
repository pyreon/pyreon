---
"@pyreon/compiler": patch
---

Fix prop-derived alias inlining crossing function scopes (#3815). `function First(props) { const label = props.label … }` made every later `label` in the module — a sibling component's own local, an import, a module const — compile to `props.label`, throwing `ReferenceError: props is not defined` at mount with no warning (native backend; the JS backend only caught a sibling's local redeclaration). Aliases, `props` names and signal variables are now lexically scoped in both backends (byte-identical): they un-register when their declaring scope ends and a nested binding of the same name hides them. A function-local `signal()` no longer makes a same-named import in a sibling function auto-call. Shadowed locals now stay plain values instead of being wrapped in a needless reactive binding.
