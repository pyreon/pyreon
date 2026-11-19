---
'@pyreon/native-compiler': patch
---

A reactive `style={cond ? {A} : {B}}` now flips a border and a per-side padding on iOS and Android. A border set in every branch (`borderWidth` + `borderColor`, or the `border` shorthand) folds its width, colour and corner radius into conditional values, so a light/dark card keeps its hairline colour. A padding box whose branches set the same sides (`padding: '10px 14px'`) folds side by side. Both used to fall back to the first branch, statically, with a warning. A value equal in every branch now emits as the plain value (`.padding(12)` rather than `.padding(cond ? 12 : 12)`).
