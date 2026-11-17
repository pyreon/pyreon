import { h } from '@pyreon/core'
import { state } from '@pyreon/core/plain'

/**
 * Interactive counter component.
 * Tests that hydration preserves interactivity.
 */
export function Counter() {
  let count = state(0)

  return h('div', { class: 'counter', 'data-testid': 'counter' },
    h('button', {
      'data-testid': 'decrement',
      onClick: () => { count = count - 1 },
    }, '-'),
    h('span', { class: 'counter-value', 'data-testid': 'counter-value' }, () => String(count)),
    h('button', {
      'data-testid': 'increment',
      onClick: () => { count = count + 1 },
    }, '+'),
  )
}
