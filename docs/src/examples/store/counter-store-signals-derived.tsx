import { signal, computed } from '@pyreon/reactivity'
import { h } from '@pyreon/core'

/**
 * Migrated from `<Playground>` — Counter store — signals + derived.
 *
 * The original playground ran inline JS inside an iframe via `mount(ui, app)`.
 * This is the same code as a real Pyreon component file: typechecked, lint-
 * covered, refactor-safe. See `<Example>` in docs/zero-content for the
 * inline-mount + signal-share contract.
 */
export default function CounterStoreSignalsDerived() {
  // A store is just signals + computeds + actions, scoped together.
  // Here we model it inline; the real defineStore() adds an id, plugin
  // hooks, and SSR-safe singleton resolution on top of this shape.
  const count = signal(0)
  const doubled = computed(() => count() * 2)
  const sign = computed(() => count() === 0 ? 'zero' : count() > 0 ? 'positive' : 'negative')

  return h('div', { class: 'col' },
    h('div', { class: 'card' },
      h('div', null,
        h('span', { class: 'muted' }, 'count: '),
        h('strong', null, () => count()),
      ),
      h('div', { style: { marginTop: '4px' } },
        h('span', { class: 'muted' }, 'doubled: '),
        h('strong', null, () => doubled()),
      ),
      h('div', { style: { marginTop: '4px' } },
        h('span', { class: 'muted' }, 'sign: '),
        h('span', { class: 'badge' }, () => sign()),
      ),
    ),
    h('div', { class: 'row' },
      h('button', { onClick: () => count.update(n => n + 1) }, '＋1'),
      h('button', { onClick: () => count.update(n => n - 1) }, '−1'),
      h('button', { onClick: () => count.set(0) }, 'reset'),
    ),
  )
}
