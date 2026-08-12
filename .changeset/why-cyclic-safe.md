---
'@pyreon/reactivity': patch
---

`why()` no longer breaks on a cyclic signal value

`why()` interpolated `JSON.stringify(e.prev)` directly, which throws on a cyclic
structure. Cyclic values in signals are ordinary — a DOM node, a store with a
back-reference, a Yjs doc, any class instance with a parent pointer.

Three failures compounded, and the third is the one that matters:

1. the throw landed inside the signal-write path;
2. the framework's trace guard caught it and printed *"signal trace listener
   threw — listener is buggy"*, blaming the user's listener when the buggy
   listener was `why()` itself;
3. the log entry was never recorded, so `why()` concluded **"No signal updates
   detected"** — a debugging tool reporting that nothing happened at exactly the
   moment something did, which sends the reader off to look somewhere else.

It now uses `preview()` from `reactive-trace.ts`, which was already cycle-safe
and whose own comment names this hazard ("Avoid full JSON.stringify — it can be
huge or throw on cycles / BigInt / getters"). The lesson had been learned in one
file and not applied in its sibling.
