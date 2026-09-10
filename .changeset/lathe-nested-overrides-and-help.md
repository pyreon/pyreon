---
'@pyreon/lathe': patch
---

Two generator bugs, both silent

**`createX(overrides)` leaked the root's overrides into every nested
object.** A field's value was rendered at the same depth as the object
holding it, so a nested object also took the `depth === 1` overrides
spread. `createUser({ id: 'x' })` therefore produced
`address: { city: …, id: 'x' }` — a shape the schema generated from the
same spec rejects, so the fixture fails the validator and the error
points at the consumer's test data.

**`lathe generate --help` generated instead of printing help.** The verb
unconditionally overrode the `--help` flag, so the one flag a user types
when they are unsure wrote a client into their repo. `--help` now wins,
and a bare path still reads as `generate`.
