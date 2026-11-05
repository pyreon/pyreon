---
'@pyreon/reactivity': patch
---

Faster effect drains: the batch drain no longer truncates already-empty queues with `length = 0` (a slow store on both V8 and JSC even when it changes nothing), and a one-effect pass empties with `pop()`, which keeps the queue's backing store. A computed diamond read by an effect drains ~40% faster on V8 and ~17% faster on JSC; no other op moves outside noise.
