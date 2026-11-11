---
'@pyreon/runtime-dom': patch
---

A child accessor, keyed-array accessor or `<For>` whose first run read no signal is no longer a `child` / `list` node in the dev reactive graph. It can never re-run, but it was counted in every Reactive Coverage report as "ran once, never re-ran". Development builds only.
