---
'@pyreon/runtime-dom': patch
---

Adopt the SSR text node behind a NON-trailing interpolation instead of
rebuilding the element's whole subtree.

`<p>Hello {name}!</p>` compiles to `<p>Hello <!>!</p>` — a placeholder with
static content after it. `templateSignature` refused that shape outright, for a
real reason: a `<!>` is ONE node in the clone and a `<!--$-->…<!--/$-->` RANGE
in the server DOM, so a compiled ref that steps past it (`__p1 =
__p0.nextSibling.nextSibling`) lands on range content. The element and
everything under it rebuilt. A 19-shape adoption census found this the only
ordinary shape still rebuilding — every prose sentence whose interpolation is
not at the very end, which is most of them.

The fix makes the server DOM match the clone before the bind runs, rather than
relaxing the refs. The signature records each mid `<!>` by CLONE child-index;
the verifier requires the server range at that index to hold at most one text
node and records it; `tplAdoptVerify` then COLLAPSES it to exactly one text node
— both markers removed, an empty text materialized when the accessor rendered
`''`. After that every positional ref is correct by construction, and both bind
kinds already handle a clone-shaped DOM: `_textSlot` adopts the text, and a
`<For>` row's `_setChildAt` writes `.data` in place instead of swapping a fresh
node. A range holding ELEMENTS still bails to the clone, exactly as before, so
a mid conditional-element slot rebuilds correctly rather than mis-adopting.

One invariant had to be re-stated explicitly. `_mountSlot`'s marker-less
adoption branch is gated on `placeholder === parent.firstChild`, which used to
prove the slot was SOLE — because the signature refused every non-trailing
`<!>`, a firstChild placeholder during adoption could be nothing else. A
collapsed mid slot at clone index 0 is now a firstChild placeholder too, and
without a discriminator `_mountSlot` hydrated the element's whole child list as
slot content, swallowing the static sibling: `<p>{off && <i/>}!</p>` hydrated to
`<p></p>`. The collapsed text now carries a Symbol brand on the node itself (a
registry keyed by DOM node is leak class C); `_mountSlot` skips its marker-less
branch for a branded node and falls to the clone path, which is correct for both
the empty and the single-text range. Caught by the spec written for exactly that
shape before it was ever run.

Plan replay stays off for mid-slot templates, mirroring the hole and innerHTML
gates: the plan records spots against child indices, and a mid slot is exactly
the case where server and clone indices disagree until the collapse. `<For>`
rows with a mid slot adopt through the full verify.

Locked by `hydrate-mid-text-slot-adoption.test.tsx` (10 specs, real
`transformJSX`): four adopt shapes with identity + reactivity asserted on the
SAME text node, two structural-divergence bails, the element-range bail, the
empty mid mount slot, and two `<For>` cases including list ops after adoption.
Bisect-verified: reverting the verifier branch fails all six adopt specs on
retention (`expected +0 to be 4`; the row case `1 to be 13`) while the bail
specs stay green. `hydrate-tpl-adoption.test.tsx`'s swap-fallback spec kept its
purpose by moving to a shape that still bails (element in the range); the shape
it used to carry now has an adopt-path twin with the same list ops.
