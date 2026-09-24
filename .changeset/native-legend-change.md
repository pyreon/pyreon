---
'@pyreon/native-compiler': minor
---

`<PlotChart onLegendChange>` now lowers to iOS and Android.

The native legend toggle already held the hidden-series set; this was the
observer half, and the smallest of the five plot props that were waiting on
host state. Both emitters route the toggled set through a local before the
state write, so the handler receives the value the state settles on rather
than re-reading `@State` / `mutableStateOf` inside the closure that wrote it.

Also fixes the lookup that found it: chart event attrs were matched
case-sensitively, and the parser lowercases them — so `onLegendChange` arrived
as `legendchange` and silently returned undefined. Every event matched before
was a single word, so the casing had never shown.
