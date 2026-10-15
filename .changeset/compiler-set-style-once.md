---
'@pyreon/compiler': patch
'@pyreon/runtime-dom': patch
---

A compiled style that can never re-run (one computed from a `<For>` item, or any non-reactive expression) is now written with the new `_setStyleOnce`, which skips the skip-if-equal cache that reactive styles keep. Recording that cache read `cssText` back after every write, a full serialization of the declaration, on every templated element with a computed style. Reactive styles are unchanged. Mounting a 10,000-item virtual list is about 8% faster.
