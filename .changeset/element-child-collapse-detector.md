---
'@pyreon/compiler': patch
---

P0 element-child collapse — PR 1 (detector + serializer + measurement).

Adds `detectStaticElementChild` / `collectStaticChildren` /
`serializeStaticChildren` + the `StaticChildNode` type to
`@pyreon/compiler`. These recognise the SAFE subset of element-child
rocketstyle call sites — children whose ENTIRE subtree is provably
static (DOM tag, string-literal props, no `on*` handlers, static
text/element children all the way down) — so a later PR's SSR resolver
can bake the whole subtree into the existing `_rsCollapse` template with
nothing reactive lost.

**Measurement-only — additive, not yet wired into the emit path.** The
collapse emit (`tryRocketstyleCollapse`), runtime (`_rsCollapse`), and
plugin scanner are byte-unchanged; all 1378 prior compiler tests pass.
The detectors feed `collapse-bail-census.test.ts`, which now reports the
go/no-go number for the resolver investment:

```
element-child STATIC-ADDRESSABLE: 16 (2.8% of all sites)
```

Of the 52 element-child bail sites in the real corpus (ui-showcase +
app-showcase + fundamentals-playground), only 16 are recursively static
— the rest wrap components or carry reactivity and correctly bail.
Element-child collapse would lift coverage 83.2% → ~86.0%. PR 2 (the
resolver structured-children channel) is gated on this number being
worth the investment.

Bisect-verified: stubbing `detectStaticElementChild` to return null
drops the census static-addressable count to 0 (assertion fails) and
fails the 20-spec detector suite; restored → all green.
