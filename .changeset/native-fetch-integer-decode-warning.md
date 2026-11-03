---
'@pyreon/native-compiler': patch
'@pyreon/hooks': patch
'@pyreon/query': patch
---

iOS and Android: the compiler now warns when a `useFetch` / `useQuery` response type has a `number` field that lowers to an integer (Swift `Int` / Kotlin `Long`). TypeScript's `number` does not say whether a value can be fractional, so `type Place = { name: string; km: number }` decoded `km` as an integer, and a payload carrying `1.2` failed to decode the whole response, leaving `data` empty with no diagnostic. The warning names the type and the field and gives the fix: declare `type Double = number` and type the field `km: Double`. Ids and counts can stay `number`. Array elements, optional fields and nested types are covered. Generated code is unchanged, and a request whose `@pyreon/http` endpoint has a response schema is not warned, because the schema already decides each field.
