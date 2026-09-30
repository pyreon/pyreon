---
'@pyreon/charts': patch
'@pyreon/native-runtime-swift': patch
'@pyreon/native-runtime-kotlin': patch
---

A dense category line (straight segments, no gaps) is now reduced straight from its value array instead of creating one point per datum and then dropping almost all of them. The drawn points are bit-identical to before. At 1M points the engine's line render drops from about 470 ms to about 46 ms, most of which was garbage collection of the dropped points. iOS and Android use the same path.
