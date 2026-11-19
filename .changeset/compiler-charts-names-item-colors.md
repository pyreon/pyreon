---
'@pyreon/compiler': patch
---

The `@pyreon/charts` migration detector knows the new `fillBy`, `shadeBy`, `ItemChannel`, `ItemFill` and `ShadeOptions` exports, so importing them is never reported as part of the removed ECharts wrapper.
