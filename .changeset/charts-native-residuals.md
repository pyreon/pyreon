---
'@pyreon/charts': minor
---

Engine: `formatTime` is now pure UTC epoch math (civil-from-days) instead of local-time `Date` getters — one shared source labels the same timestamp identically on web, iOS and Android, and the function lowers under PMTC (`new Date` is a class-construction bail). This changes default time-axis labels from device-local time to UTC; a locale/zone-aware label remains a `Formatter` the caller supplies. Also: `timeTicks` binds its formatter coalesce-first (an optional closure call does not narrow through a ternary in Swift), `fitCircle` returns a NAMED `Circle` type (an inline object return annotation lowers to a mismatched tuple), and locals that shadowed `Math.max`/`Math.min` call names are renamed (Swift scoping rejects the shadow JS allows).
