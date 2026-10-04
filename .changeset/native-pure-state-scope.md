---
"@pyreon/native-compiler": patch
---

Scope useCounter and useToggle lowering metadata to each component on both targets, preserving independent hook kinds, bounds and reset values when local names repeat. Release the metadata after component emission instead of retaining a Swift initial-value registry across compiler calls.
