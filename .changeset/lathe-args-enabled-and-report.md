---
'@pyreon/lathe': minor
---

A generated query hook now derives `enabled` from its arguments, and the run report says what actually changed.

**`args` may return `undefined` to mean "not ready".** The most common way to get a detail query wrong is to fire it before its id exists — and the natural workaround was to pass a placeholder id AND a matching `enabled` option, the same condition written twice, where getting the second one wrong requests `/books/` with an empty segment and 404s on first paint. The example's own call site carried exactly that, with a comment explaining it. Returning `undefined` now says it once:

```ts
const detail = useGetBook(() => {
  const id = selected()
  return id === undefined ? undefined : { params: { bookId: id } }
})
```

The disabled branch keys on the endpoint's own `key.prefix`, so an invalidation still matches it. A caller's `enabled: false` still disables; a caller's `enabled: true` cannot fire a request whose path parameter is missing. The type widens (`Args` → `Args | undefined`), so existing call sites are unaffected.

**The report distinguishes created / updated / unchanged.** It used to mark every file with a green `+` and then print "1 file(s) written" underneath — fourteen lines reading as "created" for one file that actually moved. Now `+` is new, `~` is updated, unchanged files are dimmed, and the count names its denominator.
