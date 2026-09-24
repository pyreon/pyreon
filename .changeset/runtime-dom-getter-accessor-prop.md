---
'@pyreon/runtime-dom': patch
---

`applyProps` resolves an accessor a getter-shaped prop returns instead of handing the closure to the static sink. A primitive's helper object (`getItemProps()` → `{ tabIndex: () => 0 | -1 }`) spread through a rocketstyle element reached the DOM as the function's source text, with a "received a function" warning on every mount (12 per `@pyreon/ui-components` scan, from Rating, Tree, SegmentedControl, NavLink and ScrollArea). The accessor is now called inside the same tracked frame, so the value stays live.
