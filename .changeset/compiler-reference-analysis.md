---
"@pyreon/compiler": patch
---

Preserve signal callable references through optional calls, computed members and TypeScript wrappers in both JavaScript and Rust. Keep lexical function, class, block, loop and catch bindings distinct from outer signals, including parameter defaults and hoisted var declarations. Visit native class expressions and prop-derived computed keys consistently, and retain the exact nested conditional/For regression from issue #3861.
