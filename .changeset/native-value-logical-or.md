---
'@pyreon/native-compiler': patch
---

A value-producing `a || b` over a number or a string now lowers on iOS and Android: `name() || 'anon'` and the parsed-field guard `Number(v) || 0` compile instead of warning. The left operand is evaluated once and the right only when the left is falsy (`""`, `0`, or `NaN`), as in JS. `&&`, an optional operand, and operands of different kinds still warn by name.
