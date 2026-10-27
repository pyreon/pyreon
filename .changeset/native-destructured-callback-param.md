---
'@pyreon/native-compiler': patch
---

A callback parameter written as a plain object pattern now lowers on iOS and Android: `<For each={todos()}>{({ title, done }) => …}</For>`, `.filter(({ done }) => !done)`, and renames such as `({ title: t }) =>` read fields of the element instead of warning and leaving the names unbound. Defaults, rest, nested and computed keys, and array patterns still warn by name.
