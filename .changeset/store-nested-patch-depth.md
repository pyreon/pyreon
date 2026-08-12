---
"@pyreon/store": patch
---

fix(store): a NESTED `patch()` (an effect calling `patch()` during an outer `patch()`) now merges into the outermost patch's SINGLE notification, instead of emitting its own and closing the shared window mid-outer

The subscribed `patch()` fast path detaches each field's change-detector, writes, re-attaches, and drains in a `batch()` — a user effect fired by that drain can call `patch()` again. The inner patch's own `finally` cleared `patchInProgress` (mid-outer) and emitted a SECOND `'patch'` notification, so one logical mutation surfaced as two events; worse, the prematurely-cleared flag meant a later re-entrant DIRECT write's event was silently buffered-and-dropped.

A `patchDepth` nesting counter (both the object-form and functional-form paths) makes only the OUTERMOST patch close the window, merge the buffered nested events, and emit once — decremented FIRST in the `finally` (before the emit) so a throwing subscriber can't wedge the depth or the flag. Bisect-verified; full `@pyreon/store` suite (213) green.
