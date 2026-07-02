---
'@pyreon/runtime-dom': patch
'@pyreon/runtime-server': patch
---

Fix a family of SSR↔hydration bugs found by a new differential parity fuzzer (render on the server, hydrate over the SSR HTML, and independently mount fresh on the client — assert zero hydration mismatch, identical DOM, and identical DOM after identical signal flips).

- **`<For>` duplicated its list on hydration** — hydration mounted fresh keyed rows but left the SSR rows in the DOM (every hydrated list rendered twice) and returned a broken sibling cursor that cascaded mismatches through the rest of the parent. Hydration now consumes the bounded `<!--pyreon-for-->…<!--/pyreon-for-->` SSR block and swaps it.
- **Adjacent text-producing children corrupted the cursor** — the HTML parser merges back-to-back text (`{23}{'hello'}` → one `"23hello"` node); hydration removed the whole merged node for the first child, dropping the rest. It now adopts each child's prefix via `splitText`.
- **Reactive accessor children with a multi-root initial** (fragment / component subtree / `<For>`) removed exactly ONE SSR node before re-mounting, leaving the rest duplicated. The SSR renderer now wraps every reactive-accessor child in `<!--$-->…<!--/$-->` hydration range markers (the analogue of the existing `<!--k:-->` / `<!--pyreon-for-->` markers, and of Solid's `<!--$-->`), and hydration swaps the whole marked range.
- **Empty-initial reactive text mis-anchored its binding** at the parent anchor instead of the cursor, corrupting sibling order.
- **A `Fragment` whose sole child is text wiped its siblings** (client mount): `mountChildren`'s `textContent =` fast path replaced the parent's entire child list — it now requires an empty parent.
- **Static text mounted inside a reactive boundary leaked on teardown** — its cleanup was `noop`, so an accessor flipping away from a fragment-of-text orphaned the old text (`() => cond ? <>a b</> : 'x'` → `"abx"`). The cleanup now removes the text node at reactive-boundary depth (matching the reactive-text fast path).
- **A reactive text accessor that later yields a VNode** rendered `"[object Object]"` (the text fast path did `text.data = String(v)` unconditionally). A new shared `bindPolymorphicText` upgrades the text binding to a subtree mount when the value stops being text (and back), used by both the client fast path and the hydration text-adoption paths.

Note: reactive-accessor children now carry `<!--$-->…<!--/$-->` comment markers in SSR output (required for correct hydration extent). Snapshot/string assertions on SSR HTML for dynamic content should account for them.
