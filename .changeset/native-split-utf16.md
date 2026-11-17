---
'@pyreon/native-compiler': patch
'@pyreon/native-runtime-swift': patch
'@pyreon/native-runtime-kotlin': patch
---

Native `str.split('')` splits into UTF-16 code units, as on the web. Before, iOS returned the whole string as one element, and Android added an empty string at each end. `[...str]` and `Array.from(str)` now give code points on both targets: Android had counted UTF-16 units and iOS grapheme clusters.
