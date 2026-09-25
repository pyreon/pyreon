---
'@pyreon/native-compiler': minor
---

Optional narrowing now lowers on iOS and Android.

A branch TypeScript narrowed — `books === undefined ? <Loading/> : <List books={books}/>`, `{sel() && <Detail item={sel()}/>}`, `if (b.tags) { … b.tags.length }`, `if (b === undefined) return 0; return b.title.length`, `s ? s.length : -1` — reads an unwrapped binding on both targets. Swift, which never narrows through a nil test, gets `if let` / `guard let` / `x.map { x in … } ?? fallback`; Kotlin, which smart-casts only parameters and locals, binds a signal, a computed or a data-class `var` field with `when (val x = …)`, `x?.let { x -> … }` or `val x = … ?: run { … }`. The subject may be an identifier, a signal or computed read, or a member chain. Truthiness on a string, number or boolean keeps JS semantics (the empty string, `0` and `false` take the falsy branch). Before, only a bare identifier in a value ternary or a statement `if` narrowed, and only on Swift; every other shape failed to compile on one target or both.

A branch that writes the narrowed value, or re-declares its name, is not rewritten and warns by name.
