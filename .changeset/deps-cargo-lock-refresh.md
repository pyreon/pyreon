---
'@pyreon/compiler': patch
---

The native (Rust) compiler backend is rebuilt against refreshed transitive crates (itoa 1.0.19, syn 3.0.10, smallvec 1.16.5, unicode-width 0.2.3, utf8_iter 1.1.0). Output is byte-identical to the previous build.
