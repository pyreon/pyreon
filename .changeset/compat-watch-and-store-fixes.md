---
'@pyreon/vue-compat': patch
'@pyreon/solid-compat': patch
---

Two bugs found while writing error-path coverage for the compat layers.

**vue-compat: `watch(..., { immediate: true })` fired its callback twice at
setup.** Once correctly as `(value, undefined)`, then again as
`(value, value)` — the effect's first run reported the same evaluation the
immediate call had already delivered. Any immediate watcher with a side effect
(a fetch, an analytics event, a DOM write) did it twice on mount. Fixed across
all four watch variants; Vue's semantics are exactly one call.

**solid-compat: a store-wrapped array threw on `JSON.stringify` and reported
`false` for `Array.isArray`.** The proxy target was a plain `{}` regardless of
the value, so forwarding the array's non-configurable `length` descriptor
violated a Proxy invariant (`TypeError: trap reported non-configurability for
property 'length'`), and anything that did serialize produced
`{"0":"a","1":"b"}` where an array belonged. `.length`, indexing and `.map()`
all worked, so a store looked healthy until something reflected over it — an
SSR blob, a localStorage write, a request body. The target now matches the
value's array-ness.
