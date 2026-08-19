---
'@pyreon/runtime-dom': minor
'@pyreon/compiler': minor
---

`<input value>` / `<textarea value>` now establish `defaultValue` on a client mount, so `form.reset()` behaves the same on a client-mounted page as on a hydrated one

SSR serializes `value` as a content ATTRIBUTE — it has to, because before JS arrives the box still has to show text — and that attribute is what `form.reset()` restores from, since `input.defaultValue` reflects it. A client mount only ever set the PROPERTY, and a property assignment never creates the attribute. The result was the same form behaving differently depending on how the user arrived:

```
client-mounted, then form.reset()  ->  ""       field clears
hydrated,       then form.reset()  ->  "hello"  field restores
```

`applyValueProp` (exported to the compiler as `_setValue`) now assigns the property and, on the FIRST application only, sets `defaultValue`. Both compiler backends emit it for `input`/`textarea`, byte-identically; every other element that owns a `value` property (`<progress>`, `<option>`, `<select>`, custom elements) keeps the plain property assignment and pays nothing.

The default is established once rather than alongside every write, which matters more than it looks: a controlled input writes its signal from `onInput`, so its value binding re-runs on every keystroke. Moving `defaultValue` with it would drag the reset target along with the typing and quietly turn `form.reset()` into a no-op. React draws the line in exactly the same place — `initInput` seeds the default from the initial value, `updateInput` only ever follows an explicit `defaultValue` prop.

Because the reflected default makes the client's serialized DOM byte-match the server's, `input.value` and `textarea.value` are now ARMED in the SSR↔hydration parity fuzzer instead of masked. `select.value` stays masked deliberately: its default lives in `<option selected>`, and React, Preact and Solid all diverge there identically.
