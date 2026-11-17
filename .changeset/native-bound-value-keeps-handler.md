---
'@pyreon/native-compiler': patch
---

iOS now runs a `<Field>`, `<Toggle>` or `<Tabs>` change handler that does more than set the bound signal. With a bare signal as `value` (`<Field value={draft} onChangeText={…}>`) the Swift emit wrote SwiftUI's `$draft` projection and dropped the handler, so `onChangeText={(t) => { draft.set(t.trim()); edits.set(edits() + 1) }}` ran on Android and silently did not run on iOS. The `$draft` projection is now used only when the handler is absent or exactly `(v) => draft.set(v)`; any other inline handler goes through `Binding(get:set:)` and runs on every edit, as it does on Android and the web.

The called read with exactly that setter, `<Field value={draft()} onChangeText={(t) => draft.set(t)}>`, is the same binding and now also emits `text: $draft` (it emitted an equivalent `Binding(get:set:)` before), so both spellings give the same SwiftUI.
