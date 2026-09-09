---
'@pyreon/runtime-dom': patch
---

fix(runtime-dom): `signal.trigger()` did nothing for an unkeyed array child

`mountReactive` skips its teardown+remount when the accessor returns the value
already mounted (#3082). That is correct for the shape it was written for — a
component's sole child is `_lc`-memoized, so the accessor hands back the SAME
`_tpl` NativeItem whose DOM and bindings were built once; tearing it down
disposes bindings the remount does not rebuild, leaving one live, permanently
stale node.

But `===` cannot separate "the same value, unchanged" from "the same value,
mutated in place" — and `signal.trigger()` is public API whose manifest entry
documents it as force-notifying subscribers "after an in-place mutation" (the
Vue `triggerRef` semantic). With an unkeyed array child, which
`mountAccessorChild` routes to `mountReactive` rather than `mountKeyedList`,
the skip made it a silent no-op:

```js
const rows = signal([<li>a</li>, <li>b</li>])
rows.peek().push(<li>c</li>)
rows.trigger()          // third row never mounted
```

The skip is now gated on the value carrying construction-time DOM
(`__isNative`), which is exactly the destructive case #3082 identified. Every
other value — a VNode, an array, a primitive — is rebuilt correctly by a
remount, which is the pre-#3082 behaviour and what `trigger()` depends on.

Introduced 2026-08-27, after 0.51.0, so this never shipped.
