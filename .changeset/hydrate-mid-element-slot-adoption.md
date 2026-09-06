---
'@pyreon/runtime-dom': patch
---

Adopt a mid-position slot whose SSR range holds ELEMENTS — `{cond && <i/>}!`,
`{xs.map(…)} tail` — instead of rebuilding the element's subtree. This closes
the last ordinary hydration shape that rebuilt.

Such a range cannot be collapsed to one node without losing its elements, but
the compiled refs after it still need the clone's single-node shape. So the
verifier PARKS it: everything after the open marker through the close marker
moves into a fragment hung off the open marker, which stays in the DOM as the
one placeholder the refs expect; the verify descent steps over the parked
range (its content is slot output the template says nothing about, exactly
like the content after a trailing slot). `hydrateMountSlot` puts the range
back — right after the open marker — and adopts it like any marked range. A
text bind that finds element content where it expected a text (`_textSlot`,
the polymorphic-upgrade shape) discards the park and takes a fresh node
WITHOUT walking the DOM for a close marker that is no longer there; that walk
would have removed the static siblings. Nested ranges park as one unit
(`findMatchingClose` is depth-aware). Plan replay stays off for mid-slot
templates.

The swap-fallback spec in `hydrate-tpl-adoption.test.tsx` needed retargeting a
second time: both shapes it has used to force the swap now adopt, so it forces
the bail the way it happens in practice — a static attribute the server never
rendered — and keeps its purpose (swap-path anchor liveness).

Two harness lessons are recorded in the specs because they cost a wrong
finding each. The compiler leaves a conditional's `<b>x{y()}</b>` as residual
JSX with a BARE `{y()}`, so the server renders the inner value with NO markers
— a hand-built inner accessor in the server arm is a document the server never
sends (the client is still reactive: the conditional's accessor re-runs on
`y`). And a `ReferenceError: _x is not defined` inside an effect is a copied
harness missing a runtime helper, not the product.

Bundle budgets: runtime-dom 18900 → 19300, `mount+hydrate` 15000 → 15300, both
by hand. This adds ~260 B gz to the bundle and ~230 B to the hydrate import;
`mount`-only is untouched. Across #3302, #3307 and this, runtime-dom has grown
about 4.7%, every byte on the hydration path — stated, not hidden.

Locked by `hydrate-mid-element-slot-adoption.test.tsx` (9 specs, real
`transformJSX`): five adopt shapes with identity and reactivity, the
`_textSlot` hazard, the no-matching-close bail, and a `<For>` case with list
ops after adoption. Bisect: reverting the park branch fails all seven adopt
specs on retention (`expected +0 to be N`) while the hazard and bail specs stay
green. runtime-dom 1466 passed (95 files); runtime-server 365; validate-fast
43/43.
