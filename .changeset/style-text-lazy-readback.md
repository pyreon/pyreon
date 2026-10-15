---
'@pyreon/runtime-dom': patch
---

A string `style` write no longer reads the declaration back. The readback, which serializes the whole declaration, is now taken only the first time the same string is written again, which is the only case where the skip-if-unchanged check needs it. Elements whose style is set once, or whose style changes on every run (a virtual-list row's `transform`), stop paying it: a virtual list scrolls about 8% faster and mounts about 5% faster.
