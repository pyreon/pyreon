import { usePrevious } from '@pyreon/hooks'
import { signal } from '@pyreon/reactivity'
import { h } from '@pyreon/core'

/**
 * usePrevious tracks the prior value of a reactive getter. The left swatch is
 * the CURRENT color; the right swatch reads usePrevious(() => idx()) and always
 * lags one step behind — so after each press it shows what the current swatch
 * WAS a moment ago. Grey on the right means "no previous yet" (first render).
 */
export default function HooksUsePreviousLagSwatches() {
  const palette = ['#4ade80', '#60a5fa', '#a78bfa', '#fbbf24', '#f87171']
  const idx = signal(0)
  const prev = usePrevious(() => idx())

  const swatch = (getColor: () => string, cls: string) =>
    h('div', {
      class: cls,
      style: () => ({
        width: '84px',
        height: '84px',
        borderRadius: '16px',
        background: getColor(),
        transition: 'background 0.2s ease',
      }),
    })

  return h(
    'div',
    { class: 'col', style: { alignItems: 'center', gap: '16px', padding: '24px' } },
    h(
      'div',
      { class: 'row', style: { gap: '18px' } },
      swatch(() => palette[idx()]!, 'current'),
      swatch(() => {
        const p = prev()
        return p === undefined ? '#cbd5e1' : palette[p]!
      }, 'previous'),
    ),
    h('button', {
      onClick: () => idx.set((idx.peek() + 1) % palette.length),
      'aria-label': 'advance color',
      style: { width: '54px', height: '30px', border: 'none', borderRadius: '9px', cursor: 'pointer', background: '#cbd5e1' },
    }),
  )
}
