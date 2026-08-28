---
'@pyreon/native-compiler': minor
---

A canonical primitive that falls through to the generic component emit now warns
by name, on both targets.

Generic emit writes `<Tag a={b}>` as a constructor call. That is right for a user
component and can never be right for a canonical primitive — `Field` and
`Toggle` are not SwiftUI types and `Field` is not a Compose composable — so the
build failed with `cannot find 'Field' in scope` / `unresolved reference
'Field'`, naming a symbol the author never wrote.

Four such cases were already covered by a hand-maintained list of required props.
The list was missing `<Field>` without `onChangeText`, `<Toggle>` without
`onChange` and `<Modal>` without `open`: the same mistake, uncompilable in the
same way, with nothing said. The check now keys on the OUTCOME instead — arriving
at generic emit IS the failure — so there is no list to keep in sync and a
primitive added tomorrow is covered the day it is added. A user component that
shadows a primitive name is unaffected.
