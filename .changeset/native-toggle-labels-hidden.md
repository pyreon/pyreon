---
'@pyreon/native-compiler': patch
---

A `<Toggle>` now sizes to its switch on iOS, as it does on the web and Android. PMTC emitted `Toggle("", isOn: …)`, and a SwiftUI `Toggle` with an empty label still lays out label, spacer and switch, so it took the free width of its row and squeezed the text beside it. The emit now chains `.labelsHidden()` on both binding shapes.
