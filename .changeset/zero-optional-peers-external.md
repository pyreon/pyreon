---
"@pyreon/zero": patch
---

The node SSR/SSG/ISR sub-build now always keeps zero's optional native peers (`sharp`) external. When `sharp` resolved only from zero's own `node_modules` (a workspace layout), Vite bundled it and the server could evaluate it at startup and crash on a missing native binary, even though zero imports it lazily.
