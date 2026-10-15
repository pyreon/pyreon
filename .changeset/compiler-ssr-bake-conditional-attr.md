---
'@pyreon/compiler': patch
---

SSR compile-to-string: an attribute whose value is a conditional between two string literals (`class={selected ? 'row on' : 'row'}`) is now baked at compile time. Both renderings are escaped when the page is compiled and the test picks one, instead of calling a runtime attribute helper on every render. Output is byte-identical; server rendering of a 1,000-row table is about 20% faster.
