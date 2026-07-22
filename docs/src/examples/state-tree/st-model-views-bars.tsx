import { model } from '@pyreon/state-tree'
import { computed } from '@pyreon/reactivity'
import { h } from '@pyreon/core'

/**
 * A model with a computed VIEW. `count` is the state; `doubled` is a view
 * derived from it. The buttons call ACTIONS (the only way to mutate a model),
 * and the green view-bar stays exactly twice the blue state-bar — recomputed
 * automatically, never set by hand.
 */
const Counter = model({ state: { count: 2 } })
  .views((self) => ({ doubled: computed(() => self.count() * 2) }))
  .actions((self) => ({
    inc: () => self.count.update((c: number) => Math.min(6, c + 1)),
    dec: () => self.count.update((c: number) => Math.max(0, c - 1)),
  }))

export default function StModelViewsBars() {
  const c = Counter.create()

  const bar = (read: () => number, color: string) =>
    h('div', {
      style: () => ({
        width: '30px',
        height: `${read() * 12 + 8}px`,
        borderRadius: '5px',
        background: color,
        transition: 'height 0.25s',
      }),
    })
  const glyph: Record<string, string> = { increment: '+', decrement: '−' }
  const btn = (aria: string, onClick: () => void, bg: string) =>
    h('button', {
      onClick,
      'aria-label': aria,
      style: { width: '30px', height: '26px', border: 'none', borderRadius: '6px', cursor: 'pointer', background: bg, color: '#1e293b', fontSize: '16px', fontWeight: 700, lineHeight: 1 },
    }, glyph[aria] ?? aria)

  return h(
    'div',
    { class: 'col', style: { alignItems: 'center', gap: '14px', padding: '18px' } },
    h(
      'div',
      { class: 'row', style: { alignItems: 'flex-end', gap: '18px', height: '162px' } },
      bar(() => c.count(), '#60a5fa'),
      bar(() => c.doubled(), '#4ade80'),
    ),
    h(
      'div',
      { class: 'row', style: { gap: '8px' } },
      btn('increment', () => c.inc(), '#4ade80'),
      btn('decrement', () => c.dec(), '#cbd5e1'),
    ),
  )
}
