import { h } from '@pyreon/core'
import { signal } from '@pyreon/reactivity'

/**
 * Interactive counter component.
 * Tests that hydration preserves interactivity.
 */
export function Counter() {
  const count = signal(0)

  return h('div', { class: 'counter', 'data-testid': 'counter' },
    h('button', {
      'data-testid': 'decrement',
      onClick: () => count.update((n) => n - 1),
    }, '-'),
    h('span', { class: 'counter-value', 'data-testid': 'counter-value' }, () => String(count())),
    h('button', {
      'data-testid': 'increment',
      onClick: () => count.update((n) => n + 1),
    }, '+'),
  )
}
