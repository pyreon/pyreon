---
'@pyreon/runtime-dom': patch
---

Fix hydration duplicating the value of a trailing interpolation.

An element whose LAST child is an interpolation, with any sibling before it,
rendered its value TWICE after hydration and left a stray close marker behind:

```
SSR       <div class="b">Count: <!--$-->7<!--/$--></div>
hydrated  <div class="b">Count: 77<!--/$--></div>
```

`<p>Hello {name}</p>`, `<div>Count: {n()}</div>`, `<p><b>B</b>{tail()}</p>` —
one of the commonest shapes in a rendered page.

The compiler bakes the same `<!>` placeholder for two slots whose adoption
contracts are opposites. A MOUNT slot is consumed by `_mountSlot`, which is
adoption-aware: handed the live `<!--$-->` it recognises the marked range and
hydrates into it. A reactive TEXT slot is consumed by `_bindText` behind an
INLINE `replaceChild` the runtime never sees — it swaps a fresh empty node in
for whatever the placeholder ref resolved to. The verifier claimed any trailing
range whose close marker was the element's last child as a mount slot and left
both markers standing, so the text bind replaced the OPEN MARKER, wrote the
value into its fresh node, and the server's own text survived beside it.

`matchDomAgainstTemplate` now refuses the one shape both slots can produce — a
trailing range holding exactly one text node — and the element rebuilds, which
is correct. This is a refusal rather than a repair because nothing distinguishes
the two: the template signature records only "this element ends with a
placeholder", and normalizing the range to suit the text bind would hand a
genuine mount slot a text-node placeholder, whose marker-less branch then mounts
a SECOND copy. An EMPTY range and a range holding ELEMENTS are unambiguous and
keep adopting; specs hold that line, since a bail that widened would quietly
cost the adoption this area exists to win.

Restoring adoption for this shape means routing the text slot through a runtime
helper the way `_mountSlot` already is — a compiler change in both backends, not
a verifier one. Deliberately not attempted here: the correctness fix should not
wait on it.

Two independent gaps let this ship. The hydration parity fuzzer builds its trees
with `h()` and never `transformJSX`, so it reaches the runtime path only and
cannot see a compiled-template defect at all — a gap its own record already
names as owed. And on a real `@pyreon/zero` page most of the body is re-mounted
rather than adopted, so the broken branch rarely ran where it would be noticed.
The new specs compile through the REAL transform for exactly that reason; a
general compiled-path fuzz is still owed.

Found while auditing why zero pages retain so little of their SSR DOM: a
19-shape adoption census (real transform, SSR, hydrate, node identity) showed
every ordinary shape already adopting, and this one adopting WRONGLY.
