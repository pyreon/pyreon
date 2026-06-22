---
title: "Performance"
description: "How to keep a Pyreon app fast — fine-grained updates, virtualizing large lists, lazy-loading heavy modules, batching, and selectors."
---

# Performance

Pyreon is fast by default: a signal change updates exactly the DOM that depends on it, with no component re-render and no virtual-DOM diff. Most apps need no tuning. This guide covers the few levers that matter when you push scale.

## The default you get for free

- **Fine-grained updates.** `{() => count()}` patches one text node, not a component subtree.
- **Compiled templates.** JSX lowers to `cloneNode` + direct bindings — zero VNode allocations on the hot path.
- **Components run once.** No re-render means no re-render cost; the work is proportional to what changed.

## Virtualize large lists

A 10k-row `<For>` allocates ~10k signals + cleanup closures. The signal struct is already near its memory floor, so the lever is to **render only what's visible** with `@pyreon/virtual`:

```tsx
import { useVirtualizer } from '@pyreon/virtual'

function BigList(props: { rows: Row[] }) {
  const v = useVirtualizer({ count: props.rows.length, estimateSize: () => 32, getScrollElement: () => scrollEl })
  return (
    <div ref={scrollEl} style={{ height: '400px', overflow: 'auto' }}>
      <For each={v.virtualItems()} by={(i) => i.key}>
        {(item) => <Row row={props.rows[item.index]} />}
      </For>
    </div>
  )
}
```

## Lazy-load heavy modules

Heavy packages (`@pyreon/charts`, `code`, `flow`, `document`) should not sit in the initial bundle if they're only used on interaction. Use a dynamic import inside the handler:

```tsx
async function onExport() {
  const { render } = await import('@pyreon/document')  // chunk loads on click, not on page load
  render(doc, 'pdf')
}
```

`@pyreon/lint`'s `no-heavy-import-only-in-handler` flags a heavy static import used solely in a handler. For components, `lazy(() => import('./Heavy'))` code-splits with Suspense.

## Batch and select

- **`batch(fn)`** — coalesce 3+ writes into a single update pass.
- **`createSelector(source)`** — O(1) keyed membership for "is this row selected?" across large lists, instead of O(n) per row.

```tsx
import { batch, createSelector } from '@pyreon/reactivity'

const isSelected = createSelector(selectedId)   // each row: isSelected(row.id) is O(1)
batch(() => { a.set(1); b.set(2); c.set(3) })   // one pass
```

## Measuring

- `@pyreon/perf-harness` exposes dev-mode counters (mount, signalCreate, styler.resolve, …) — `perfHarness.overlay()` shows them live (Ctrl+Shift+P).
- `examples/benchmark` runs the row-list benchmark; `bun run measure-memory` reports retained bytes per primitive.

## Common pitfalls

- **Imperative work in `effect()` at setup.** `effect(() => fetch(...))` runs synchronously during setup and allocates per instance — put fetches/timers/listeners in `onMount`. (`no-imperative-effect-on-create` flags this.)
- **A 10k-row list without virtualization.** Virtualize; don't try to make signals smaller.
- **Statically importing a heavy module used only on click.** Dynamic-import it in the handler.

## Related

- [Virtual reference](/docs/reference/virtual) · [Reactivity in Depth](/docs/guides/reactivity-in-depth)
- [Why Pyreon](/docs/why-pyreon) — the honest benchmark story
