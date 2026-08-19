---
"@pyreon/runtime-dom": minor
---

Hydration ADOPTS `.map()`-composed and multi-root dynamic regions instead of rebuilding them

A component list written with `.map()` retained **0 of 241** server nodes through
hydration, while the identical list under `<For>` retained all of them. The final
DOM was correct either way, so nothing warned.

Four independent layers discarded the server DOM:

1. `templateSignature` refused every compiled template containing a `<!>`
   mount-slot placeholder, so a `.map()` CONTAINER never adopted — it cloned, and
   the NativeItem branch then replaced the whole server subtree.
2. The multi-root branch of `hydrateReactiveChild` mounted fresh and DELETED the
   entire `<!--$-->…<!--/$-->` range. This one governs every multi-root dynamic
   region, not just `.map()`.
3. `runtime-server` ELIDES those range markers when the accessor is its element's
   sole child (the tag boundary already delimits the extent). That decision is
   read from the static vnode shape, which the compiled `_tpl` + `_mountSlot`
   path consumes too — and it had never joined the agreement, so a sole
   `.map()` child went looking for a range the server deliberately never emitted.
   It now adopts the element's whole child list, synthesizing the elided close so
   it runs the SAME adoption core as a marked range — including the removal
   contract, without which a flip away from the adopted content stranded every
   server node beside the fresh render.
4. `hydrateSoleAccessorChild` — the `h()`-side reader of that same elision —
   adopted only a single text node and mounted fresh for anything else, retaining
   1/N for a multi-root region.

All four now adopt. Slot adoption is gated on each `<!>` being its parent's LAST
child, because a slot is one node in the clone but an arbitrary run in the server
DOM — any compiled ref walk that steps past it would land on slot content instead
of the node it names. Shapes that would cross a slot (`<div><!><!></div>`,
`<div><!><footer/></div>`) fall back to the clone, unchanged.
