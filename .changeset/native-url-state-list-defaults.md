---
'@pyreon/url-state': patch
'@pyreon/native-compiler': patch
'@pyreon/native-router-swift': patch
'@pyreon/native-router-kotlin': patch
---

Native: `useUrlState('tags', ['a', 'b'])` now lowers on iOS and Android. An array default of string, number or boolean literals of one type becomes a list binding over the web's comma format, element type taken from the literals the way the web takes it from the first element (an empty array stays strings). The codec matches the web's byte for byte, including the `,` / `%` escaping, a blank or malformed element resetting the whole list to the default, and `?tags=` reading as the empty list; it is asserted by executing the shipped Swift and Kotlin against `inferSerializer`. An Int list holds whole numbers only, like the scalar Int binding. A mixed array, a non-literal element and an object default still stay web, each with a named warning.

To make a method chained onto the binding lower correctly (`tags().slice()` was emitted verbatim, which neither target accepts), a callable declaration can now type its bare call (`DeclEmitter.typing.value`).

Also: a whole `Double` above 1e15 now serializes as its digits (`9007199254740991`, not `9.007199254740991E15` / `9007199254740991.0`), and Swift prints `Infinity` / `-Infinity` / `NaN` like JS rather than `inf`. Fractional values and exponent forms (below 1e-6, from 1e21) still use each target's own spelling.
