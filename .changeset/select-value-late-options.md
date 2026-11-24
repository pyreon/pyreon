---
'@pyreon/runtime-dom': patch
'@pyreon/compiler': patch
---

`<select value>` selects its option when that option arrives after mount (a `<For>` over a list that loads later, options swapped in by `<Show>`, options inside an `<optgroup>`) (#4820). The value is applied at mount and, if no option matched yet, once a matching option arrives; after that the select is uncontrolled, so a user's pick, a removed option or an unmatched value behave as before. Set the signal to select something else. `multiple` selects are unchanged. Before, the value was applied once after the first children mount, and a select whose options arrived later showed its first option while the signal held a valid value. The handling ships only with apps that render `<select value>`: the compiler emits `_setValue` for it (as for `<input>`/`<textarea>`) plus a module-level `_selectWait()` call that turns it on; an app that builds selects with `h()` and no compiler calls `_selectWait()` (from `@pyreon/runtime-dom`) once itself. Plain `mount` grows by 28 B gzipped. A nullish `value` leaves the selection to the options' own `selected`, on both paths.
