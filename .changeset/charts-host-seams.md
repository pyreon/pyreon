---
'@pyreon/charts': patch
---

fix(charts): two seams in the newest chart hosts — a frozen prop forward and a dropped RTL mirror

**`hostPropsFor` value-copied its passthrough props.** `<OptionChart>` receives a
signal-driven prop as a getter (the compiler emits `_rp(() => …)` and
`makeReactiveProps` installs it), and `hostPropsFor` runs once at setup — so
reading `props[k]` there fired the getter and pinned the result forever. The host
reads `width`, `height`, `title` and `rtl` LAZILY, so they would have been live;
the copy is what froze them. `<OptionChart width={w()} />` ignored every later
`w.set(...)` and laid out at the mount-time width. Now forwarded as accessors,
the same idiom `grammar.tsx` already uses for ~60 keys into these same hosts.
Presence is still decided with `in`, which does not fire the getter, so an absent
prop stays absent and the host's defaults still apply.

**`paintCached` dropped the RTL mirror.** `canvasHost` has two paint paths and
only `draw()` applied the presentation transform. `paintCached` runs on every
tick of the update tween, on each arrow key, on Escape and on blur — so an RTL
chart un-mirrored on the first keypress, and a data change painted frame 0
mirrored and every later frame unmirrored, SETTLING unmirrored while the pointer
seam kept mirroring. `present` now lives above both paths and both go through it.

Both files are new this cycle (2026-09-03 and 2026-09-07), so neither shipped.
