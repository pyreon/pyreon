---
'@pyreon/charts': minor
'@pyreon/native-compiler': minor
---

The geo geometry crosses into the native engine

`geo.ts` is now the crossing half and `geo-web.ts` the web half, matching
`calendar.ts` / `calendar-web.ts` and for the same reasons. `geo-web.ts` keeps
exactly what cannot cross: GeoJSON's `Polygon | MultiPolygon` union (one field
at two array depths), the untyped `properties` bag, the runtime name registry,
and the record→list adapter.

Adding it to `ENGINE_FILES` was the verification, and it took eleven distinct
subset violations to get both toolchains compiling. They arrived in three
tiers, and no single gate found more than one tier:

**The generator** (it refuses any emit carrying warnings) caught a tuple return
(`geoDomain` → the `Domain` struct the engine already had), three ring walks
written `for (let i = 0, j = n - 1; i < n; j = i++)` — only the canonical count
loop lowers, so `ringArea`, `ringCentroid` and `pointInRing` would all have
generated as silently gutted functions — a spread inside a draw command
(`points: [...ring, ring[0]!]` reads as mixed element types and dropped the
whole polyline literal), and a `Record<string, Double>` parameter.

**swiftc / kotlinc** caught four the generator emitted CLEANLY: `NaN` and
`Infinity` are JS globals with no lowering that emit verbatim and produce
`cannot find 'NaN' in scope`; `colorRamp` is the web closure factory where the
crossing form is `rampColor(stops, t)`; `measureApprox()` likewise, where the
crossing default is `approxTextWidth`; two `T | null` locals have no contextual
type on either target; and a chained `a.y > py !== b.y > py` is a Swift parse
error, since `>` and `!==` share a non-associative precedence group.

**The native suite** caught the last, which compiled fine in isolation and only
broke OTHER families: `GeoValue { name, value }` is structurally a subset of
`TreeNode`, so a treemap literal started resolving to it. The field is `region`
now — distinct, and the better name.

Every fix came from a convention the engine already states: `heat.ts`'s header
names `rampColor` as the crossing form, `river.ts` and `treemap.ts` both say
"no Infinity sentinels", `gantt.ts` shows the measurer default, and
`indicator-values.ts` spells a gap `0.0 / 0.0`.

**Breaking**: `geoDomain` returns `Domain` rather than a tuple,
`GeoOptions.domain` takes one, and `renderGeo`/`geoDomain` take `GeoValue[]`
(`geoValues(record)` converts). Callers that lay out and render through
`layoutGeo` / `geoToSvg` / `<MapChart>` are unaffected; the surface exported
from `@pyreon/charts/plot` is the same symbols, now from two modules.

Engine: 296,834 → 308,306 bytes of generated Swift.
