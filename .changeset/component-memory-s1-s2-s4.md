---
"@pyreon/reactivity": patch
"@pyreon/runtime-dom": patch
"@pyreon/compiler": patch
---

Less retained memory per mounted component. On the 2,047-component deep tree, retained heap drops from about 602 KB to about 534 KB (−11%).

- A reactive text binding (`{expr}`, `{props.x}`) no longer builds its text↔subtree swap machinery up front. It builds it only when the value first stops being text.
- Bindings built by a compiled template are owned only by the template's cleanup. They no longer also register with the component's scope. If a setup, a render or a `<For>` row callback throws after building bindings, those bindings are still disposed.
- A template with several bindings returns its cleanup through a runtime helper (`_dispose2`, `_dispose3`, `_dispose4`, `_disposeN`). The old inline cleanup kept the component's props and captured locals alive for as long as the template was mounted. Code compiled by this compiler needs this `@pyreon/runtime-dom`. The packages are released together.
- Fixed: an accessor or VNode passed as a template child through `_setChild` / `_setChildAt` (for example `<p>{label}</p>` where `label` is a function) is now fully disposed when its component unmounts. Before, only its inner binding was disposed, and only when that binding happened to register with the component's scope.
- Fixed: a component mounted inside its parent's template now restores the parent's current scope when it finishes, instead of clearing it. Effects and computeds that the parent's template creates after a child component are now owned by the parent.
