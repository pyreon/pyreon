import { signal, computed } from '@pyreon/reactivity'
import { h } from '@pyreon/core'

/**
 * Migrated from `<Playground>` — rx — aggregation (sum / avg / max).
 *
 * The original playground ran inline JS inside an iframe via `mount(ui, app)`.
 * This is the same code as a real Pyreon component file: typechecked, lint-
 * covered, refactor-safe. See `<Example>` in docs/zero-content for the
 * inline-mount + signal-share contract.
 */
export default function RxAggregationSumAvgMax() {
  // rx.sum() / rx.average() / rx.max() are shipped as one-liners
  // over a signal of an array. The implementation underneath is
  // essentially what's spelled out here.
  const scores = signal([85, 92, 78, 95, 88, 72, 90])

  const total = computed(() => scores().reduce((a, b) => a + b, 0))
  const avg = computed(() => total() / Math.max(1, scores().length))
  const best = computed(() => Math.max(...scores(), 0))
  const worst = computed(() => Math.min(...scores(), 100))

  const stat = (label: any, value: any) =>
    h('div', { class: 'card', style: { textAlign: 'center', minWidth: '80px' } },
      h('div', { class: 'muted', style: { fontSize: '11px' } }, label),
      h('div', { style: { fontSize: '20px', fontWeight: '700' } }, value),
    )

  return h('div', { class: 'col' },
    h('div', { class: 'row' },
      stat('total', () => total()),
      stat('avg',   () => avg().toFixed(1)),
      stat('best',  () => best()),
      stat('worst', () => worst()),
    ),
    h('div', { class: 'muted' }, () =>
      scores().length + ' score(s): ' + scores().join(' · '),
    ),
    h('div', { class: 'row' },
      h('button', {
        onClick: () => scores.update(s => [...s, Math.floor(Math.random() * 30) + 70]),
      }, '＋ random score'),
      h('button', { onClick: () => scores.set([]) }, 'clear'),
    ),
  )
}
