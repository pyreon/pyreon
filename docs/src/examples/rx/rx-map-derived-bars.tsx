import { map } from '@pyreon/rx'
import { signal } from '@pyreon/reactivity'
import { h } from '@pyreon/core'

/**
 * `map` over a signal returns a reactive Computed. The top row reads the
 * source array; the bottom row reads `doubled = map(source, v => v * 2)`.
 * Bumping the source recomputes the derived array automatically — the green
 * bars stay exactly twice the grey ones, with no manual wiring.
 */
export default function RxMapDerivedBars() {
  const source = signal([2, 4, 3, 5])
  const doubled = map(source, (v) => v * 2)

  const bump = () => source.set(source().map((v) => (v >= 6 ? 1 : v + 1)))

  const bar = (read: () => number, color: string) =>
    h('div', {
      style: () => ({
        width: '22px',
        height: `${read() * 11 + 6}px`,
        borderRadius: '4px',
        background: color,
        transition: 'height 0.25s',
      }),
    })

  const idxs = [0, 1, 2, 3]
  const row = (cls: string, read: (i: number) => number, color: string) =>
    h(
      'div',
      { class: `row ${cls}`, style: { alignItems: 'flex-end', gap: '8px', height: '150px' } },
      ...idxs.map((i) => bar(() => read(i), color)),
    )

  return h(
    'div',
    { class: 'col', style: { alignItems: 'center', gap: '14px', padding: '18px' } },
    row('srcrow', (i) => source()[i] ?? 0, '#94a3b8'),
    row('derrow', (i) => doubled()[i] ?? 0, '#4ade80'),
    h('button', {
      onClick: bump,
      'aria-label': 'bump values',
      style: {
        width: '46px',
        height: '28px',
        border: 'none',
        borderRadius: '8px',
        cursor: 'pointer',
        background: '#60a5fa',
      },
    }),
  )
}
