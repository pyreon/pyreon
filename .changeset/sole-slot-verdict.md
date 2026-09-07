---
'@pyreon/compiler': patch
'@pyreon/runtime-dom': patch
---

Fix DUPLICATED DOM after hydration when a compiled slot's value begins with a
nested reactive range — a `<Show>` (its root accessor is range-marked) or a
fragment whose first child is an accessor — inside an element where that slot
is the sole child.

runtime-server elides the `<!--$-->` pair around an element's SOLE accessor
child (the tag boundary already delimits it), so in that shape the slot's first
server node was the NESTED range's `<!--$-->`. `_mountSlot` read a `<!--$-->` at
its placeholder as the slot's own range, handed the nested consumer a region
whose markers were already consumed, and that consumer fell to the legacy
remove-one-node path: `<b>t<input><input></b>`, a `<For>` under a `<Show>` with
every row twice. Found by the compiled-path hydration parity fuzz at 3000 seeds
(seeds 1237 / 2447); it is on every release since compiled-slot adoption
landed, and became reachable for the `<p>{sig()}x</p>` sibling shape once
literal children started baking (#3318).

The runtime cannot decide soleness. Position fails the mirror shapes
(`<main>{null}{acc}</main>`, `<span><>{acc}</></span>` — SSR counts the `{null}`
and the fragment as children and MARKS the slot, while the client template
renders no node for them and the ref lands on `firstChild` all the same; seeds
150 / 273 / 291), and the marker fails the nested-range shapes. So the compiler
emits the verdict: `_mountSlot(…, true)` on exactly the sole shape, derived from
the same `ssrSoleChild` predicate the SSR emit uses for `_escSole`, in both
backends (byte-identical, native-equivalence + fuzz-equivalence locked). Every
other slot's emit is unchanged. The same verdict now gates the lone-reactive-
text `firstChild` fast form: `<p>{null}{n()}</p>` and `<p><>{n()}</></p>` take
the `_textSlot` placeholder form, so hydration adopts their server text instead
of the verifier refusing the template and rebuilding it.

Locked by `sole-slot-verdict.test.tsx` (both seed shapes, the three mirror
shapes, and server-text-node identity for the text twin), all compiled through
the real `transformJSX` for SSR and client alike. Bisect-verified two ways:
runtime reverted → the seed shapes duplicate; compiler reverted → the seed
shapes duplicate and the text twins lose the server node.
