---
'@pyreon/sync': patch
---

A create-if-missing default can no longer destroy real data.

Seeding `initial` into the same CRDT map as real data made a default able to BEAT that data: two fresh peers in an empty room both seed on first sync, so one peer's seed is causally CONCURRENT with the other's real write, and `Y.Map` resolves concurrency by clientId — which Yjs assigns randomly. Roughly half the time the default won and the value was permanently lost (the "two devices open, one types, the other's default wipes it" report).

Defaults now live in a companion `<map>:defaults` key space. Reads prefer the data map, so a default can never outrank a real value no matter how the tie falls; concurrent defaults still tie among themselves, which is harmless (peers converge on one default instead of diverging). Backward compatible: docs persisted with their default in the data map keep reading it.
