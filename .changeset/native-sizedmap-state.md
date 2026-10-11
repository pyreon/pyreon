---
"@pyreon/native-compiler": patch
"@pyreon/sized-map": patch
---

Preserve component-local SizedMap instances across native rerenders with SwiftUI state and Compose remember. Keep its own size, get, set, has, delete and clear surface instead of rewriting it as a platform dictionary or constructing a fresh cache inside handlers. Add an opt-in declConstructs plugin hook so mutable classes can declare their storage and types without changing existing call recognizers.

Resolve SizedMap constructor imports by lexical identity in both declaration and expression lowering, preserving aliases while leaving shadowed parameters and local bindings alone.
