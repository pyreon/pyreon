---
'@pyreon/zero': minor
---

Removed the `vite` option from `ZeroConfig`. It was typed and documented but never read, so setting it did nothing. Put Vite options in `vite.config.ts` directly. Docs and JSDoc examples no longer mention a `zero.config.ts` file, which nothing reads; configuration lives in `zero({...})` in `vite.config.ts`.
