---
"@pyreon/native-compiler": patch
---

`@pyreon/coolgrid` and `@pyreon/elements` lowering moves out of the emitters into element-lowering plugins (`plugins/coolgrid.ts`, `plugins/elements.ts`) that use only the new `EmitContext` facade, registered through an element-lowering registry keyed by `(module, tag)` with the same import guard as before. The compiled Swift/Kotlin for every source in the golden corpus is byte-identical. `parse.ts` now records the import source of any tag a registered lowering claims, and normalises any scoped sub-path import (not only `@pyreon/*`) to its package root. No public API change: the registry is internal for now.
