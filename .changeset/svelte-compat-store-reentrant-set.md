---
'@pyreon/svelte-compat': patch
---

Store subscribers now see every value in order when a subscriber calls `set` during a notification, as in Svelte.

A `set` made from inside a subscriber notified everyone immediately, then the outer notification resumed with the newer value: with `store.set(1)` and a first subscriber that answers `1` with `set(2)`, a later subscriber received `0, 2, 2` and never saw `1`. Notifications now go through Svelte's (subscriber, value) queue, drained by the outermost `set`, so that subscriber receives `0, 1, 2`. A subscriber that throws no longer stops later notifications.
