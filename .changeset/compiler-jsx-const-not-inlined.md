---
'@pyreon/compiler': patch
'@pyreon/zero': patch
'@pyreon/zero-content': patch
---

A prop-derived `const` whose initializer contains JSX anywhere is now referenced, never inlined, on every path and in both backends. Examples: `const el = <img alt={props.alt} />`, `const el = props.f ? <b /> : <i />`, `const row = () => <li>{props.x}</li>`. The inlined copy was un-lowered source: it read props once and rebuilt the element (and any component state in it) on every read. The const's own JSX already binds props live. Under SSR the native backend used to inline a ternary, `&&` or function initializer that the JS backend kept, so the two backends produced different output. A const that picks a branch by a prop now picks it at setup. Write the choice where it is used, as `{() => (props.f ? <b /> : <i />)}`, or make the const a function.

`@pyreon/zero`'s image placeholder and `@pyreon/zero-content`'s `CodeBlock` line-number gutter are now function consts, so they still follow their props under this rule.
