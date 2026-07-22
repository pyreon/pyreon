import { Switch, Match, h } from '@pyreon/core'
import { signal } from '@pyreon/reactivity'

/**
 * `<Switch>` renders the first `<Match>` whose `when` is truthy — exactly one
 * branch is in the DOM at a time. Cycling the signal swaps which panel shows,
 * with no manual mount/unmount.
 */
export default function CoreSwitchMatch() {
  const which = signal(0)
  const cycle = () => which.set((which.peek() + 1) % 3)

  const panel = (color: string) =>
    h('div', { class: 'panel', style: { width: '92px', height: '92px', borderRadius: '16px', background: color } })

  return h(
    'div',
    { class: 'col', style: { alignItems: 'center', gap: '16px', padding: '20px' } },
    h(
      Switch,
      {},
      h(Match, { when: () => which() === 0 }, panel('#60a5fa')),
      h(Match, { when: () => which() === 1 }, panel('#4ade80')),
      h(Match, { when: () => which() === 2 }, panel('#f87171')),
    ),
    h('button', {
      onClick: cycle,
      style: { padding: '6px 16px', border: 'none', borderRadius: '8px', cursor: 'pointer', background: '#a78bfa', color: '#fff', fontSize: '13px', fontWeight: 600 },
    }, 'Cycle'),
  )
}
