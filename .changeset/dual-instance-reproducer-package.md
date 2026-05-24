---
'@pyreon/dual-instance-reproducer': patch
---

New workspace-internal package: empirical reproducer for the dual-module-instance bug class. Loads `@pyreon/reactivity` twice in the same Node process (via absolute-path dynamic imports of the copied `lib/` tree) and asserts the framework contract holds. The single contract test is currently marked `it.fails` to document the known-broken state on main; the winning candidate from `.claude/plans/jaunty-herding-kazoo.md` will flip it to `it` as part of its PR, establishing a permanent CI regression gate. NOT published.
