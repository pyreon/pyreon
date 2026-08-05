---
'@pyreon/native-compiler': patch
---

Sorting by a fractional column now compiles on Android. `items().sort((a, b) => a.price - b.price)` emitted a Kotlin `Comparator` returning Double where `Int` is required (`argument type mismatch: actual type is 'Double', but 'Int' was expected`) — a JS comparator returns any number and only its sign matters, but `Comparator.compare` does not. Kotlin only: Swift converts the difference to the Bool its `sorted(by:)` wants, so it never saw the comparator's own type and compiled throughout. The fix converts the sign explicitly when the body is fractional, and is gated on inferred float rather than applied everywhere — an Int comparator's emit is byte-identical, and a non-numeric body (`a.name > b.name ? 1 : -1`) is left alone.
