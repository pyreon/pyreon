---
'@pyreon/runtime-dom': patch
'@pyreon/compiler': patch
---

`<select value>` is controlled: when its options change after mount (a `<For>` over a list that loads later, options swapped in by `<Show>`, options inside an `<optgroup>`), the current value is applied again, so the select shows the matching option as soon as it exists (#4820). Before, the value was applied once after the first children mount, and a select whose options arrived later showed its first option while the signal held a valid value. Works on the compiled path (the compiler now emits `_setValue` for `<select value>`, as for `<input>`/`<textarea>`), the `h()` path and after hydration. A nullish `value` leaves the selection to the options' own `selected`, on both paths.
