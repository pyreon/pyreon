---
'@pyreon/hooks': patch
---

`useFocusTrap`'s `initialFocus` now lands on content revealed by the same update that activates the trap (`hidden={!open()}`, a `<Show>`). Focus is placed one microtask after activation instead of synchronously, so it no longer depends on whether the content's binding subscribed before the trap. A pending initial focus is dropped when the trap deactivates or unmounts first.
