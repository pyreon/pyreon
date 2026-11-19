---
'@pyreon/compiler': patch
---

The `@pyreon/charts` migration detector knows the new `log`, `sqrt`, `symlog`, `SymlogOptions` and `ScaleView` exports, so importing them is never reported as part of the removed ECharts wrapper.
