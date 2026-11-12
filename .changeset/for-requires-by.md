---
'@pyreon/core': patch
'@pyreon/compiler': patch
---

`<For>` without `by` now fails with `[Pyreon] <For> requires a \`by\` prop`, naming the fix, on the client, the server and in hydration, instead of `getKey is not a function` deep inside the list. `by` was already required by the type and the docs; the compiler's `missing-key-on-for` warning and the `for-missing-by` detector no longer promise an index-based fallback.
