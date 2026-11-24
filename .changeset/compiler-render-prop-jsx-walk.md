---
'@pyreon/compiler': patch
---

A signal passed as a component prop inside a render prop stays reactive again (#4797). `render={() => <For each={items}>…</For>}` and `<Show when={open}>` inside a render prop compiled to a one-time read (`each={items()}`) since 0.54, so the list or condition never updated. JSX inside a render prop (any non-handler, non-`ref` attribute value, including a property of a spread object) is now compiled like any other JSX, so such a prop is `_rp(() => items())`, the same as at a component's top level. Event handlers and refs keep their 0.53 semantics: JSX they build is built when they run, an explicit read there (`row={selected()}`) is the value at that moment, and a bare signal prop or child (`show(<For each={items}>…</For>)`) is passed as the signal itself instead of being read once. The native compiler no longer panics (and silently falls back to the JavaScript compiler) on a component spread whose object builds JSX.
