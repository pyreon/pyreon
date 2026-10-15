---
'@pyreon/hotkeys': patch
---

Registering and unregistering a hotkey is about 2.9× faster: the registration-order list is now a linked list instead of a Set, a previously registered shortcut string resolves with one cache lookup, and emptied key buckets are kept for the next mount. A mount/unmount cycle of 12 shortcuts now beats tinykeys.
