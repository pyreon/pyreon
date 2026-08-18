---
'@pyreon/core': minor
'@pyreon/compiler': minor
---

Fix: a nested component setup no longer closes its parent's lifecycle-hook frame.

`runWithHooks` opened the setup frame with `setCurrentHooks(hooks)` and closed it
with `setCurrentHooks(null)` — a reset to a constant rather than a restore of the
caller's frame. Component setup genuinely nests: the compiler lowers an element
with a conditional or `.map` child to `_tpl(html, bindFn)` whose `bindFn` calls
`_mountSlot(...)`, and `_tpl` runs `bindFn` synchronously at its call site. So

```tsx
const box = <div>{show && <Child />}</div>  // Child's full setup runs HERE
onMount(() => { /* ... */ })                // frame already closed → dropped
```

ran `Child`'s entire setup partway through the parent's, and every
`onMount` / `onUnmount` / `onUpdate` / `onErrorCaptured` the parent registered
afterwards was silently discarded — surfacing only as a dev warning that blamed
the caller for using a hook "outside component setup".

The frame is now restored rather than reset, so each component keeps its own
hooks at any nesting depth.

`pyreon doctor diagnose` / MCP `diagnose` now also explain the residual case —
the hook genuinely called outside setup (after an `await`, in a handler, inside
an effect), which drops the callback silently.
