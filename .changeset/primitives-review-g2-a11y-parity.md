---
'@pyreon/primitives': patch
'@pyreon/native-runtime-swift': patch
'@pyreon/native-runtime-kotlin': patch
---

Fix four web↔native parity and accessibility gaps in the new primitives.

- `<Tabs>`: when `value` names no tab, the first tab is now tabbable. Before, every tab had `tabindex="-1"` and the tab bar could not be reached by keyboard.
- `<CanvasText>`: its web `<svg>` layer is no longer `aria-hidden`. Screen readers now read canvas text on the web, as VoiceOver and TalkBack already do natively. Shape layers stay decorative.
- iOS `<Field kind="date" | "time" | "datetime">`: an unpadded or short value (`"2026-2-3"`, `"26-02-03"`, `"9:30"`) now counts as "no value". `DateFormatter` accepted these even with `isLenient = false`, so iOS showed a date where the web and Android show an empty field.
- Android `<Select>`: choosing the option that is already selected no longer calls `onChange`. A web `<select>` fires no `change` event in that case.
