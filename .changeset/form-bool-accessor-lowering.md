---
'@pyreon/native-compiler': patch
---

`form.isValid()` / `form.isSubmitting()` lower to the native property reads

The web API exposes both as accessors, so the documented spelling is a call. The
native `PyreonForm` exposes them as stored Bool properties, and the emit passed
the call through verbatim — so the web-correct line failed with `cannot call
value of non-function type 'Bool'` on swiftc and `expression 'isValid' of type
'Boolean' cannot be invoked as a function` on kotlinc.

Same inversion `useOnline()` and `useAppState()` already carry.
