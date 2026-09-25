---
'@pyreon/validate': patch
---

`multipleOf` is float-safe for a fractional step. It used `value % step === 0`, and `0.01` has no binary representation, so `19.99 % 0.01` is not `0` and `.multipleOf(0.01)` rejected every valid price — on the interpreter, the JIT (which inlined the same `%`) and the `/mini` action alike. A fractional step now accepts a value whose quotient is an integer to within one division's rounding error, falling back to exact decimal arithmetic when the quotient is beyond 2^52; an integer step is unchanged and still inlines `%` in the JIT.
