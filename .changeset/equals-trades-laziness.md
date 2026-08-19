---
"@pyreon/reactivity": patch
"@pyreon/form": patch
---

Document that `{ equals }` trades laziness for gating, and gate `useFieldArray().length`

`computed(fn, { equals })` does not simply add an equality check — it switches
the computed from LAZY to EAGER, because gating requires knowing the new value
at notification time. With a live subscriber that is free (it would have
evaluated anyway). Without one, a computed that was never evaluated now
evaluates on every dependency change.

That inverts the obvious advice. Gating `computed(() => walkEntireDocument(doc()))`
buys a suppressed notification and pays a full document walk on every keystroke
whenever nothing is subscribed. The rule is now stated where a reader meets the
option: gate CHEAP bodies (`n > 0`, `arr.length`, `x !== undefined`), leave
expensive ones lazy.

`useFieldArray().length` was exactly the cheap case the docs already used as
their example of what to gate, un-gated in our own code. `items` changes
identity on every move/swap while the count does not, so four reorders sent
five notifications where one was correct.
