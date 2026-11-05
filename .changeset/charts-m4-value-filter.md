---
'@pyreon/charts': patch
'@pyreon/native-runtime-swift': patch
'@pyreon/native-runtime-kotlin': patch
---

Faster M4 decimation for dense category lines. Within each pixel column, a value's y is now computed only when the value goes past the column's current lowest or highest value. A value between them cannot change either extreme, because y is monotone in the value. The chosen points are unchanged, bit for bit. The generated Swift and Kotlin chart engines are regenerated with the same loop.
