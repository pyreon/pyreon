---
'@pyreon/store': minor
'@pyreon/atlas': patch
---

**Breaking:** a store subscriber now receives ONE argument, the mutation, and reads the state snapshot from `mutation.state`. Migrate `subscribe((mutation, state) => …)` to `subscribe((mutation) => … mutation.state …)`; TypeScript flags the old two-parameter form.

The snapshot is lazy: it is built the first time `mutation.state` is read and cached on that mutation, so a subscriber that only reads `events` (or nothing) no longer pays for a full state copy on every write. With more than one subscriber the snapshot is taken before the first callback runs, so a write made by one subscriber never leaks into what another reads. A sole subscriber sees the store as of its first read of `mutation.state`, so read it at the top of the callback if the callback also writes.

Also: a store with exactly one subscriber is notified directly, without iterating the subscriber Set, and the per-store fields that only subscribe, object `patch` and plugin cleanups use are no longer initialised for a store that never uses them. `@pyreon/atlas`'s store recorder reads `mutation.state`.
