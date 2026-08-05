---
'@pyreon/runtime-dom': patch
---

Compiled-template hydration adoption: `_tpl` can now bind against existing SSR DOM instead of cloning. The `<For>` hydration-adoption path arms a one-shot target before each row's renderItem; the compiled row's `_tpl` call verifies the SSR row against its template (tag + per-element text-count signature, `$`-triplet validation, all before any mutation) and on match runs the compiled bind over the server-rendered nodes — compiled apps now ADOPT server DOM. Previously every compiled row was rebuilt and swapped in, and the swap left each ForEntry's anchor pointing at the detached SSR node, corrupting later list moves/removals after hydration — that anchor bookkeeping is also fixed (re-resolved from the row's k: marker), locked by a bisect-verified regression test that reproduces the exact duplication corruption when reverted. Any verification bail falls back to the (now-correct) swap. Emits `runtime.tpl.adopt`.
