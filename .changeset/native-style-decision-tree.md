---
'@pyreon/native-compiler': minor
'@pyreon/rocketstyle': minor
---

Several dynamic rocketstyle dimensions now lower natively. A component with both `state` and `size` driven by signals used to warn and freeze every dimension at its first branch, so it never reacted on iOS or Android. Each point of the dimension product now resolves as a nested ternary, and the style connector folds that into one nested conditional value per property (Swift `cond ? … : …`, Compose `if (cond) … else …`, and a nested Compose `color` argument for Text).

The same path makes an inline nested style ternary lower, where it used to be dropped: `style={a() ? (b() ? {…} : {…}) : {…}}`. A property present on only some leaves is still warned, as before.
