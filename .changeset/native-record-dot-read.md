---
'@pyreon/native-compiler': patch
'@pyreon/hooks': patch
---

A field read through a string-keyed record (`rec.fields.title` on a `useDatabase` record, or any `Record<string, string | number | boolean>`) lowers to a subscript on iOS and Android, with the value type's empty value for an absent key. It was emitted verbatim and failed both native builds with no warning. A record whose values have no empty value, and a component binding or prop named `body` (which collides with SwiftUI's `View.body`), are now named.
