---
'@pyreon/compiler': patch
---

A signal passed as a component prop inside JSX that a function builds stays reactive again (#4797). `render={() => <For each={items}>…</For>}` and `<Show when={open}>` inside a render prop compiled to a one-time read (`each={items()}`) since 0.54, so the list or condition never updated. The compiler now compiles JSX inside an attribute value (a render prop, a handler, a `ref`) like any other JSX, so such a prop is `_rp(() => items())`, the same as at a component's top level. An element whose attribute value builds JSX (`<button onClick={() => show(<Dialog />)}>`) now renders through `h()` instead of a template, so that JSX is compiled too.
