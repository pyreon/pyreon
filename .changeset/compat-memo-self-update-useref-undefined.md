---
'@pyreon/react-compat': minor
'@pyreon/preact-compat': minor
---

`memo` no longer drops a memoized component's own state updates, and `useRef()` starts at `undefined` as it does in React and Preact.

A component wrapped in `memo` ignored its own `useState` / `useReducer` updates: the setter ran, but the component kept rendering its old output. The compat wrapper passes the same props object to every render of an instance, so `memo` compared that object with itself, found it equal, and returned the cached result. `memo` now compares a snapshot of the props and never skips a render that the component triggered itself (its own state, a context it reads, an external store), matching React.

`useRef()` with no argument returned `{ current: null }`, so the lazy-init idiom `if (ref.current === undefined) ref.current = create()` never ran. It now returns `{ current: undefined }`. `useRef(null)` and `useRef(value)` are unchanged.

Breaking for types: `useRef<T>()` is now typed `{ current: T | undefined }`, so passing it as a DOM `ref` no longer typechecks. Write `useRef<HTMLInputElement>(null)`, which is also React's form.
