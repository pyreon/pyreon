---
'@pyreon/elements': minor
'@pyreon/native-compiler': minor
---

`@pyreon/elements` `<List>` lowers on iOS and Android. `<List data component itemKey>` becomes a Stack (with List's own layout props) of keyed rows rendering `component` per item, its fields spread onto the component's props; `valueName` passes a primitive item as that one prop. On Android the rows lay out in the Stack itself rather than in a `LazyColumn`, because a List is a plain flex container. `itemProps`, `wrapProps`, `wrapComponent` and a non-component `component` are warned by name. Before this, `<List>` was emitted verbatim and failed the native build.
