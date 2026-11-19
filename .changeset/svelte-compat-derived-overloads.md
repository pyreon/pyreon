---
'@pyreon/svelte-compat': patch
---

`derived()` now infers its callback's parameter types under strict TypeScript. `derived(count, ($count) => $count * 2)` failed `tsc --strict` with "Parameter '$count' implicitly has an 'any' type", because the callback was typed as a union of the sync and the `set` forms. `derived` now has the same two overloads as `svelte/store`.
