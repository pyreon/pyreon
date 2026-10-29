---
'@pyreon/primitives': minor
'@pyreon/native-compiler': minor
'@pyreon/native-runtime-swift': minor
'@pyreon/native-runtime-kotlin': minor
---

New `<Select>` primitive: choose one value from a list with each platform's own picker.

```tsx
<Select value={fruit()} options={[{ value: 'apple', label: 'Apple' }]} onChange={(v) => fruit.set(v)} placeholder="Pick a fruit" />
```

On the web it renders a `<select>`. On iOS it lowers to `PyreonSelect`, a menu-style `Picker`. On Android it lowers to `PyreonSelect`, a Material 3 `ExposedDropdownMenuBox`. `options` is `{ value, label, disabled? }[]`, exported as the `SelectOption` type. `value` is the chosen option's value. `''`, or any value no option has, selects nothing and shows the placeholder. A disabled option is listed but cannot be chosen, and the placeholder cannot be chosen once something is. Every user choice goes through `onChange`.

A list typed `SelectOption[]` is passed to the native runtime unchanged. A list of your own type is mapped to `SelectOption`, which reads `disabled` only when your type declares it. A type without `value` and `label` gets a named compiler warning.

Also fixed: a signal write is now typed by the signal. `xs.set([{ value, label }])` used to build its objects from whichever declared struct matched their fields first. In a file that also imports `@pyreon/charts`, that was the chart engine's `PolarTick`, so the assignment did not compile.
