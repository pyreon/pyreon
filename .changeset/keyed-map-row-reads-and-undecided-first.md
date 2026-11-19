---
'@pyreon/compiler': patch
'@pyreon/runtime-dom': patch
---

Keyed `.map()` lists: a signal read inside a row updates that row, and a list whose first render is empty still reconciles by key.

**Row reads.** In `<Comp>{rows().map((row) => <li key={row.id}>{row.label()}</li>)}</Comp>` — and in a component prop holding such a list, or the inner `.map` of a keyed row — the compiler copied the expression into its accessor as raw text, so `{row.label()}` was not made reactive. The list re-ran instead, kept the row for the unchanged key, and the cell stayed stale. Both compiler backends now walk such expressions, so a row reads its own signals as a `<For>` row does, and a component in a row gets live props. The same shape directly inside a compiled element (`<ul>{rows().map(…)}</ul>`) is fixed by the template-hole walk in a separate change. A hand-written `h()` row keeps the existing contract: a value read eagerly while building the row is captured once per key, so use an accessor (`() => row.label()`).

**Empty first render.** A reactive child whose first value was `[]` or `undefined` (`rows()?.map(…)` before the data arrives) was fixed to the general path, so every later update re-created every row and lost focus, typed input and transitions. The binding now waits for a value it can classify; hydration over an empty server list does the same. A keyed list also accepts a later non-array value (`null` renders nothing, a lone vnode renders one row) instead of throwing.
