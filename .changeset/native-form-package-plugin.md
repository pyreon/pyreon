---
'@pyreon/native-compiler': minor
'@pyreon/form': minor
---

Move form and field-array native lowering into the form package's discoverable plugin. Add generic field, iteration, callback-scope and validator hooks while preserving generated Swift/Kotlin output. Direct compiler consumers must install the form plugin explicitly.
