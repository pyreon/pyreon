---
'@pyreon/native-compiler': minor
---

`<Text size>` and `<Text weight>` now accept the two-literal ternary
(`size={dense() ? 'sm' : 'lg'}`) that every other styling prop supports; they
were on the static-only reader and silently dropped it.

`<Image fit>` and `<Field kind>` warn by name instead of dropping. Both drive a
structural choice — `fit="none"` selects a different AsyncImage initializer,
`kind="password"` selects SecureField — so a ternary cannot lower as one
expression. Symmetric on both targets.
