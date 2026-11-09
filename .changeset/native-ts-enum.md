---
'@pyreon/native-compiler': minor
---

TypeScript `enum` declarations now work on iOS and Android. Before, they produced no code, so every `Filter.Done` that used one broke the native build.

- A string enum (`enum Filter { All = 'all', Done = 'done' }`) becomes a native enum, the same way the union `type Filter = 'all' | 'done'` does.
- A numeric enum (`enum Dir { Up, Down = 5, Left }`) becomes a number, and each member keeps the value it has on the web (`Dir.Left` is 6).

A few cases still warn and are not compiled: an enum that mixes strings and numbers, a member whose value is computed, and a reverse lookup such as `Dir[0]`.
