import { model } from '@pyreon/state-tree'
import { computed } from '@pyreon/reactivity'
import { h } from '@pyreon/core'

/**
 * Actions drive a model forward; a view reads the result. `next`/`back` step
 * the `step` field, the tiles light left-to-right as it grows, and the
 * `done` view (step ≥ 5) glows the completion dot once every tile is filled.
 */
const Stepper = model({ state: { step: 0 } })
  .views((self) => ({ done: computed(() => self.step() >= 5) }))
  .actions((self) => ({
    next: () => self.step.update((s: number) => Math.min(5, s + 1)),
    back: () => self.step.update((s: number) => Math.max(0, s - 1)),
  }))

export default function StModelProgressTiles() {
  const st = Stepper.create()

  const tile = (i: number) =>
    h('div', {
      style: () => ({
        width: '30px',
        height: '30px',
        borderRadius: '7px',
        background: i < st.step() ? '#4ade80' : '#e2e8f0',
        transition: 'background 0.2s',
      }),
    })
  const glyph: Record<string, string> = { back: '←', next: '→' }
  const btn = (aria: string, onClick: () => void, bg: string) =>
    h('button', {
      onClick,
      'aria-label': aria,
      style: { width: '30px', height: '26px', border: 'none', borderRadius: '6px', cursor: 'pointer', background: bg, color: '#1e293b', fontSize: '15px', fontWeight: 700, lineHeight: 1 },
    }, glyph[aria] ?? aria)

  return h(
    'div',
    { class: 'col', style: { alignItems: 'center', gap: '14px', padding: '18px' } },
    h('div', { class: 'row tiles', style: { gap: '8px' } }, ...[0, 1, 2, 3, 4].map((i) => tile(i))),
    h('div', {
      class: 'done',
      style: () => ({
        width: '18px',
        height: '18px',
        borderRadius: '50%',
        background: st.done() ? '#22c55e' : '#e2e8f0',
        boxShadow: st.done() ? '0 0 12px #22c55e' : 'none',
        transition: 'background 0.2s, box-shadow 0.2s',
      }),
    }),
    h(
      'div',
      { class: 'row', style: { gap: '8px' } },
      btn('back', () => st.back(), '#cbd5e1'),
      btn('next', () => st.next(), '#4ade80'),
    ),
  )
}
