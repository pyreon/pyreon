import { pipe } from '@pyreon/rx'
import { signal } from '@pyreon/reactivity'
import { h } from '@pyreon/core'

/**
 * `pipe` collapses a whole chain into ONE computed. Here it keeps the values
 * ≥ 3 and doubles them. The top row is every source value (grey); the bottom
 * row is only the ones that pass, doubled (green) — so bumping the source
 * makes green bars appear or vanish as values cross the threshold.
 */
export default function RxPipeFilterBars() {
  const source = signal([1, 4, 2, 5, 3])
  const strong = pipe(
    source,
    (arr: number[]) => arr.filter((v) => v >= 3),
    (arr: number[]) => arr.map((v) => v * 2),
  )

  const bump = () => source.set(source().map((v) => (v >= 6 ? 1 : v + 1)))

  const bar = (val: number, color: string) =>
    h('div', {
      style: {
        width: '22px',
        height: `${val * 12 + 6}px`,
        borderRadius: '4px',
        background: color,
      },
    })

  return h(
    'div',
    { class: 'col', style: { alignItems: 'center', gap: '14px', padding: '18px' } },
    h(
      'div',
      { class: 'row srcrow', style: { alignItems: 'flex-end', gap: '8px', height: '96px' } },
      () => source().map((v) => bar(v, '#cbd5e1')),
    ),
    h(
      'div',
      { class: 'row passrow', style: { alignItems: 'flex-end', gap: '8px', height: '170px' } },
      () => strong().map((v) => bar(v, '#4ade80')),
    ),
    h('button', {
      onClick: bump,
      style: {
        padding: '6px 16px',
        border: 'none',
        borderRadius: '8px',
        cursor: 'pointer',
        background: '#60a5fa',
        color: '#fff',
        fontSize: '13px',
        fontWeight: 600,
      },
    }, 'Bump'),
  )
}
