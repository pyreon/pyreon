---
'@pyreon/runtime-dom': patch
---

`<For>`'s owns-parent bulk clear and full-replace branches (`handleFastClear` / `handleReplaceAll`, plus the keyed-array sibling in `mountKeyedList`) now wipe the block IN PLACE with one native `replaceChildren(...)` call instead of a `cloneNode(false)` + `replaceChild` parent swap. The swap silently REPLACED the parent element, dropping its expando-delegated event handlers (`__ev_*`), refs, observers, and direct listeners — e.g. `<ul onClick={…}><For …/></ul>` lost its click handler after the first clear or full replace. Parent identity is now preserved (locked by parent-identity + `runtime.mountFor.clearFast`/`replaceFast` counter specs, bisect-verified). Measured trade, real Chromium interleaved CPU profiles (2026-08-17): the swap was ~20µs/1000-rows faster on-CPU, inside the fair bench's 100µs timer quantum; happy-dom clears/replaces are ~5–10% faster with the new form.
