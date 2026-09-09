---
'@pyreon/charts': patch
---

The map family gets the draw-list golden every other family already had

Counting hosts against `__goldens__/`: 19 chart hosts, 23 goldens, and exactly
one family host with none — `map`. (`OptionChart` is the ECharts facade and is
web-only by design.)

That gap mattered more than a missing row, because the geo reduction was
refactored in the same session it was found: `Polygon` and `MultiPolygon` are
the union collapsed into one normalised ring shape, and nothing in the suite
would have noticed the reduction quietly dropping one of them.

So the fixture is the one `geo.test.ts` uses — two polygons plus a
MULTIPOLYGON of two smaller ones — and one region deliberately carries no
value, so the output holds both geometry kinds, both ramp ends and the no-data
fill: 4 polygons, `#e2e8f0` twice, and the ramp's low and high once each.

Bisect-verified as load-bearing: making `geoShapes` drop MultiPolygon fails the
golden with a snapshot mismatch, and nothing else in the suite reacts.
