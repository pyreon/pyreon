---
'@pyreon/runtime-dom': minor
---

Hydration now ADOPTS compiled templates instead of rebuilding them.

A component whose body is a static DOM subtree compiles to a single `_tpl()`
call. Hydration cloned that template and replaced the server-rendered nodes
with the clone, so every templatized subtree in every compiled SSR app was
discarded and rebuilt — measured retention was 0/2 for a leaf and 0/4 for a
three-level tree. Only `<For>` rows adopted, and only because they armed the
one-shot `_tpl` target themselves.

That is a correctness bug rather than a performance cost: state living on the
server nodes did not survive. Text typed into an uncontrolled input before the
bundle booted was wiped, focus was lost, scroll position reset, and listeners
attached by non-Pyreon code were dropped.

`hydrateComponent` now arms the same one-shot target with the component's SSR
cursor, so a root `_tpl` binds against the existing nodes, and the swap is
skipped when the adopted element already is the cursor. Adoption is gated on
the template's static skeleton (tags, static attributes, static text) being
byte-equal to the target, which keeps a non-root template from claiming the
slot in a way that could corrupt it.
