---
'@pyreon/runtime-dom': patch
---

Row-plan replay hydration for keyed `<For>` adoption. A `<For>`'s rows are structurally identical, but hydration re-interpreted the same vnode shape for every row. Now a plan is built once from the first row's shape (which positions need props applied, which are reactive text bindings — prop-less elements and static text need no step at all) and replayed per row with direct node hops and zero interpretive dispatch, using the same binding primitives (`applyProps`, `bindPolymorphicText`). Every step is verified per row before anything is bound; any mismatch — and any unsupported row shape (components, fragments, nested For, `<select>`, adjacent text) — falls back to the interpretive walk for that row, so correctness is unchanged by construction. Cross-framework hydration bench: Pyreon 1.33× → 1.20× vs Vue (~0.8ms off a 1,000-row page), with React/Preact ratios unchanged as in-run controls. Emits `runtime.hydrate.rowReplay`.
