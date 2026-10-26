---
"@pyreon/compiler": patch
---

Fix prop-derived const inlining breaking semicolon-free code (#3987). The compiler replaces an inlined name with `(<its initializer>)`, so a statement that began with such a name began with `(`, and ASI joined it to the previous line: `start.set(x)` then `loadItems()` became a call of `start.set(x)` (a runtime `TypeError`), and `const seq = ++counter` then `api.fetchItems()` a parse error that failed the whole build. A leading `;` is now emitted exactly where one is needed (an expression statement in a statement list, after a statement that does not already end itself), in both the JS and native backends. Semicolon-style code compiles byte-for-byte as before.
