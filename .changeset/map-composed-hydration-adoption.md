---
"@pyreon/runtime-dom": minor
---

Hydration ADOPTS `.map()`-composed and multi-root dynamic regions instead of rebuilding them

A component list written with `.map()` retained **0 of 241** server nodes through
hydration, while the identical list under `<For>` retained all of them. The final
DOM was correct either way, so nothing warned.

Two independent layers discarded the server DOM:

1. `templateSignature` refused every compiled template containing a `<!>`
   mount-slot placeholder, so a `.map()` CONTAINER never adopted — it cloned, and
   the NativeItem branch then replaced the whole server subtree.
2. The multi-root branch of `hydrateReactiveChild` mounted fresh and DELETED the
   entire `<!--$-->…<!--/$-->` range. This one governs every multi-root dynamic
   region, not just `.map()`.

Both now adopt. Slot adoption is gated on each `<!>` being its parent's LAST
child, because a slot is one node in the clone but an arbitrary run in the server
DOM — any compiled ref walk that steps past it would land on slot content instead
of the node it names. Shapes that would cross a slot (`<div><!><!></div>`,
`<div><!><footer/></div>`) fall back to the clone, unchanged.
