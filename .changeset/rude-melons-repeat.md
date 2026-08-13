---
'@pyreon/native-compiler': patch
---

Fix three ways the native type gate rejected correct code.

**The permissions stub was the wrong kind.** `PyreonPermissions` is an
`@Observable final class` at runtime but a `struct` in the validation stub.
That is not cosmetic: the emit binds it through `@Environment` (read-only), so
a struct cannot typecheck the mutators at all. It was also missing five
members (`can` / `cannot` / `set` / `grant` / `revoke`) and the `granted`
property, so `perms.grant("post.edit")` failed with *value of type
'PyreonPermissions' has no member 'grant'*.

**`perms.set(...)` emitted an assignment.** The `signal.set(v)` → `signal = v`
lowering fired on any `.set(` with an identifier receiver unless the name sat
in a hand-maintained exclusion list — a silent-hole generator: every binding
whose `set` is a *real* method has to be remembered, and a forgotten one emits
`x = v` against a non-assignable receiver. Three had to be remembered
(`useUrlState`, `syncedSignal`, and now `usePermissions`, found only because a
stub-parity sweep happened to compile the call). Identifier receivers are now
deny-by-default, keyed on the tracked signal/computed declarations, so the next
one is correct without anyone noticing it exists. Member-expression receivers
(`store.field.set(v)`) keep their previous behaviour.

**`PyreonSyncedSignal.dispose` was missing from both stubs**, so a correct
`s.dispose()` was rejected. This had left the stub/runtime parity gate red on
`main`; it is fixed by mirroring the runtime rather than widening the ratchet,
which is now six entries shorter.
