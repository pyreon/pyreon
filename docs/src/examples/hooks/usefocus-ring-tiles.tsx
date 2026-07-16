import { useFocus } from '@pyreon/hooks'
import { h } from '@pyreon/core'

/**
 * useFocus tracks focus state reactively. Spread its `props` (onFocus/onBlur)
 * onto a focusable element and read `focused()` in a style thunk — each tile
 * lights up and lifts while it holds keyboard focus (Tab between them) and
 * returns to grey on blur. Each tile owns its own independent focus signal.
 */
export default function HooksUseFocusRingTiles() {
  const tile = (accent: string, n: number) => {
    const { focused, props } = useFocus()
    return h('button', {
      ...props,
      class: 'tile',
      'aria-label': `focus tile ${n}`,
      style: () => ({
        width: '92px',
        height: '92px',
        borderRadius: '16px',
        border: 'none',
        cursor: 'pointer',
        background: focused() ? accent : '#cbd5e1',
        transform: focused() ? 'scale(1.06)' : 'scale(1)',
        transition: 'background 0.18s ease, transform 0.18s ease',
      }),
    })
  }

  return h(
    'div',
    { class: 'row', style: { justifyContent: 'center', gap: '20px', padding: '30px' } },
    tile('#4ade80', 1),
    tile('#60a5fa', 2),
    tile('#a78bfa', 3),
  )
}
