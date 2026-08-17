---
'@pyreon/core': minor
---

`elementRef()` — one value that is both the ref and the element accessor

Eleven hooks across `@pyreon/hooks` and `@pyreon/dnd` take their target as
`() => HTMLElement | null`. That forced three touchpoints for one concept:
declare a `let`, hand-write the thunk, wire the ref back. Repo-wide that is
50 declarations and 194 thunk sites; a single kanban card writes the same
thunk twice because it uses two hooks on one element.

```tsx
const panel = elementRef<HTMLDivElement>()
useClickOutside(panel, close)   // it IS () => T | null
useElementSize(panel)           // …and N hooks share it
<div ref={panel}>               // …and it IS a ref
```

Purely additive: every existing hook takes it unchanged, because it already
has the accessor shape they declare. `.current` is kept so it drops into code
written against `createRef`.
