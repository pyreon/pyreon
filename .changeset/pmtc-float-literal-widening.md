---
'@pyreon/native-compiler': patch
---

A number written as a float now stays a float, even when its value is integral.

`10.0` and `0.0` satisfy `Number.isInteger`, so their value alone cannot tell
them from `10` and `0` — they emitted as `Int` and poisoned every expression
they took part in (`binary operator '*' cannot be applied to operands of type
'Int' and 'Double'`). Writing the decimal point did not help, which is what made
it hard to work around: there was no spelling that produced a Double. The
literal's raw source text is now read, which is the only place that evidence
exists.

The same problem from the other direction: a `Double`-annotated local
initialized with a plain integer (`const scale: Double = 1`) now widens from its
annotation.

A plain integer with no float evidence still emits as `Int` — widening
everything would break indices and counts, which is why Int is the default.
