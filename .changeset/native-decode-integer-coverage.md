---
'@pyreon/native-compiler': patch
---

The native "this `number` decodes as an integer" warning now covers every decode target, not only a declared struct's fields. `useFetch<{ price: number }>`, `useQuery<{ total: number }>`, `JSON.parse(s) as { avg: number }`, a `Record<string, number>` field and a bare `useFetch<number[]>` / `<number>` / `<Record<string, number>>` all lower `number` to Swift `Int` / Kotlin `Long`, so a fractional value (`9.99`) failed the whole decode on iOS and Android with no warning (the check returned early when the file declared no struct, and never walked inline objects, `Record` values or bare targets). Each is now named, with the `type Double = number` fix.
