---
'@pyreon/dnd': patch
---

Update `@atlaskit/pragmatic-drag-and-drop` 2.x → 3.0.0 and move off the legacy
entry points.

v3's only breaking change is that every API gained a direct export path, with
the old subpaths kept as deprecated compatibility shims. The bump alone
therefore needs no code change — but it would leave the package importing paths
that are already slated for removal, so all 12 imports are migrated to the new
entries (`element/adapter` → `adapter/element-adapter`, `combine` →
`utils/combine`, and the `external/*` pair fanned out into four).
