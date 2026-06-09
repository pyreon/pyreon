import { signal, computed } from '@pyreon/reactivity'
import { h } from '@pyreon/core'

/**
 * Migrated from `<Playground>` — rx — composable reactive pipeline.
 *
 * The original playground ran inline JS inside an iframe via `mount(ui, app)`.
 * This is the same code as a real Pyreon component file: typechecked, lint-
 * covered, refactor-safe. See `<Example>` in docs/zero-content for the
 * inline-mount + signal-share contract.
 */
export default function RxComposableReactivePipeline() {
  // Each step (filter, sortBy) is wrapped in computed() so the chain
  // re-derives ONLY when its input signal changes. The real @pyreon/rx
  // supplies these as one-liners via filter() / sortBy() / pipe().
  const items = signal([
    { name: 'Banana', price: 2 },
    { name: 'Apple', price: 1 },
    { name: 'Cherry', price: 3 },
    { name: 'Date', price: 1 },
  ])
  const maxPrice = signal(2)

  const cheap = computed(() => items().filter(i => maxPrice() >= i.price))
  const sorted = computed(() => [...cheap()].sort((a, b) => a.name.localeCompare(b.name)))

  return h('div', { class: 'col' },
    h('div', { class: 'row' },
      h('span', { class: 'muted' }, 'max price:'),
      h('input', {
        type: 'range', min: '1', max: '3', step: '1', value: () => maxPrice(),
        onInput: (e: any) => maxPrice.set(Number(e.target.value)),
      }),
      h('span', { class: 'badge' }, () => '$' + maxPrice()),
    ),
    h('div', { class: 'card' },
      h('div', { class: 'muted', style: { marginBottom: '6px' } }, 'sorted result'),
      h('div', null, () =>
        sorted().length === 0
          ? '∅ no matches'
          : sorted().map(i => i.name + ' ($' + i.price + ')').join(' · '),
      ),
    ),
    h('div', { class: 'row' },
      h('button', { onClick: () => items.update(p => [...p, { name: 'Elderberry', price: 1 }]) }, '＋ Elderberry'),
      h('button', { onClick: () => items.update(p => p.slice(0, -1)) }, 'Remove last'),
    ),
  )
}
