---
'@pyreon/native-compiler': patch
---

On Android, object literals in a component signal now use the data class the compiler generates for that signal. Before, each literal got its own throwaway class. That was harmless while every row had the same value types, but `signal([{ x: 1.5 }, { x: 3 }])` (a column mixing fractional and whole numbers, such as prices) gave the rows different classes. The list then had no common element type, and the first field read (`pts()[0].x`) failed to compile on Kotlin, while iOS compiled. Rows now share the class, and a whole number in a Double field is converted. A literal matches a class by field names only when every value fits that field's type, so a `{ id: 'id' }` column definition does not take over a `{ id: number }` row class. The emitted Kotlin is smaller and now matches the iOS output for the same source.
