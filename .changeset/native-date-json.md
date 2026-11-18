---
'@pyreon/native-compiler': patch
'@pyreon/native-runtime-swift': patch
'@pyreon/native-runtime-kotlin': patch
---

Native: a struct field typed `Date` now decodes from the web's ISO string and encodes back to it.

A `Date` is still its epoch milliseconds (a `Double`) in emitted logic. Before this fix, a decoded struct with a `Date` field failed the whole decode on iOS and Android when the JSON held the ISO string a server sends. `JSON.stringify` wrote the milliseconds.

The field is now declared with an ISO-string codec:
- Swift: the `@PyreonISODate`, `@PyreonOptionalISODate` and `@PyreonISODates` property wrappers.
- Kotlin: `@Serializable(with = PyreonDateSerializer::class)` and its list twin.

The codec covers a `Date` field, an optional `Date` field and a `Date[]` field. A `Date` nested deeper, for example in `Record<string, Date>`, gets a warning.
