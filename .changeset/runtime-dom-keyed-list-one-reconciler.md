---
'@pyreon/runtime-dom': patch
---

Keyed `.map()` lists now run through the same reconciler as `<For>`, and `<For>` keeps rows in the right order when a key repeats.

A reactive child that returns keyed vnodes (`{() => items().map((x) => <li key={x.id}>…</li>)}`) had its own reconciler, a second copy of `<For>`'s. It is now `<For>`'s, with the vnode as the item and its `key` as the key, so the client bundle carries one keyed reconciler instead of two: about 390 B gzip off the benchmark table app and every other app (all apps shipped both, through `mountChild`). Keyed lists also get `<For>`'s fast paths (contiguous insert and remove, small permutations), and lose a duplicate check that was quadratic in the list length on every update. Rows keep their DOM nodes exactly as before. One difference: a vnode without a key in an otherwise keyed list is now re-mounted on each update while its keyed siblings keep their rows; before, one missing key re-mounted the whole list.

Duplicate keys in `<For>` are invalid (development builds warn), but production promised that the first occurrence wins. Only the first render kept that promise. An update that repeated a key could leave a row at the wrong position, mount a row twice, or leave a stray row behind. Every update path now keeps each key once, at its first position.
