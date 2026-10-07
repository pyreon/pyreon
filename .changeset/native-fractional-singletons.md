---
"@pyreon/native-compiler": patch
---

Infer fractional default arguments before helper and singleton method return types. Emit integer-to-Double conversions for known helper, store, and model signatures, including numeric arrays. Infer store computed values and cumulative model views within their own field scope so fractional state produces valid Swift and Kotlin.
