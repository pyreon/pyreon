import { Show, h } from '@pyreon/core'
import { signal } from '@pyreon/reactivity'

/**
 * `<Show>` mounts its children when `when()` is truthy, and its `fallback`
 * otherwise — a reactive conditional, no manual mount/unmount. Toggling the
 * signal swaps the green panel for the grey placeholder in place.
 */
export default function CoreShowToggle() {
  const on = signal(true)

  return h(
    'div',
    { class: 'col', style: { alignItems: 'center', gap: '16px', padding: '20px', minHeight: '150px', justifyContent: 'center' } },
    h(
      Show,
      {
        when: () => on(),
        fallback: h('div', { class: 'ph', style: { width: '92px', height: '92px', borderRadius: '16px', background: '#e2e8f0' } }),
      },
      h('div', { class: 'panel', style: { width: '92px', height: '92px', borderRadius: '16px', background: '#4ade80' } }),
    ),
    h('button', {
      onClick: () => on.set(!on.peek()),
      'aria-label': 'toggle',
      style: { width: '46px', height: '28px', border: 'none', borderRadius: '8px', cursor: 'pointer', background: '#60a5fa' },
    }),
  )
}
