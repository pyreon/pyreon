---
'@pyreon/validate': patch
---

On iOS and Android, `withField` metadata now keeps its boolean and number values. `FieldMeta` has `autoFocus: boolean` and `defaultValue: unknown`, but the native lowering kept only string values and dropped the rest without a warning, so `field.autoFocus` did not exist in native code. Booleans and numbers, including negatives, now lower as typed fields: `Bool`/`Boolean`, `Int` for a whole number in 32-bit range, otherwise `Double`. A value with no compile-time literal, such as a variable, an object or an array, is now named in a warning instead of vanishing.
