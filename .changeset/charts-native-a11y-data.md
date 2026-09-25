---
'@pyreon/native-compiler': minor
'@pyreon/native-runtime-swift': minor
'@pyreon/native-runtime-kotlin': minor
---

Native charts now expose their data to screen readers, not just a one-sentence description.

- **iOS:** the plot host carries an `AXChartDescriptor` (`.accessibilityChartDescriptor(PyreonChartDescriptor(input))`), so VoiceOver offers the Audio Graph and its per-point data explorer.
- **Android:** `PyreonChartPoints` places one TalkBack node per visible category over its column, labelled with the web table's row ("art, Score 91"). The nodes take no pointer input, so taps still reach the canvas. A zoomed chart labels its visible rows from the full data. Decimated and continuous-x charts keep the description alone.

Both are built from the same `A11yInput` as the description and the web's hidden table.
