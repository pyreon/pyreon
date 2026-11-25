---
'@pyreon/charts': minor
'@pyreon/native-runtime-swift': patch
'@pyreon/native-runtime-kotlin': patch
---

Charts speak the app's language. The accessible description, the table's headers and truncated caption, the keyboard announcements, the scale note, the data view's close button and the gauge, candlestick and heatmap sentences were English-only; they now come from `ChartMessages` (templates with `{slots}`, unset fields English), given in a `registerLocale(tag, { messages })` pack picked by `locale`, or as a chart's own `messages` prop (which wins field by field; family hosts and the `*ToSvg` functions that derive a description take it too). `description` replaces the sentence outright. The `messages` prop lowers to iOS and Android: the regenerated native chart engine reads it, so VoiceOver and TalkBack, the data view and an untitled family chart's name use the same words. A gauge's description now ends with a full stop, like its SVG twin, and the candlestick and heatmap sentences format their numbers with the chart's `format`. Fixes #4832.
