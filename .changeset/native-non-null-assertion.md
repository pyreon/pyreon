---
'@pyreon/native-compiler': patch
---

TypeScript's non-null assertion `x!` now force-unwraps an optional natively (Swift `x!`, Kotlin `x!!`). The parser used to drop it, so `<Show when={() => u() !== null}>{u()!.name}</Show>` read a member off an optional and failed to compile on both targets, with no warning. The unwrap is emitted only when the argument's native type is optional; `names()[0]!` stays unchanged.
