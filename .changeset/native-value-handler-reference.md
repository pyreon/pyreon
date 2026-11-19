---
'@pyreon/native-compiler': patch
---

A value-change handler passed by reference now receives the value on iOS and Android. `<Field onChangeText={save}>`, `<Toggle onChange={flip}>`, `<Select onChange={props.onPick}>` and `<Tabs onChange={go}>` emitted `save()` with no argument when the function takes one, which neither swiftc nor kotlinc accepts; next to a bare signal (`value={draft}`) iOS dropped the handler for the `$draft` projection. The handler is now called with the value when the referenced function (a component function, a file-scope helper or a function-typed prop) takes a parameter. A zero-parameter callback keeps the no-argument call, and now runs on iOS next to a bare signal as it does on Android and the web. A signal's setter passed by reference (`onChangeText={draft.set}`), which emitted the uncallable `draft.set`, writes the value too.
