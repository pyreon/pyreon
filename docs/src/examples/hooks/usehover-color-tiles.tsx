import { useHover } from '@pyreon/hooks'
import { h } from '@pyreon/core'

/**
 * useHover tracks pointer-hover reactively. Spread its `props` onto an element
 * and read `hovered()` inside a style thunk — each tile lights up while the
 * pointer is over it and returns to grey when it leaves. No click, no state
 * wiring: the hook owns the reactive boolean and the two enter/leave handlers.
 */
export default function HooksUseHoverColorTiles() {
  const tile = (accent: string) => {
    const { hovered, props } = useHover()
    return h('div', {
      ...props,
      class: 'tile',
      style: () => ({
        width: '96px',
        height: '96px',
        borderRadius: '18px',
        background: hovered() ? accent : '#cbd5e1',
        transition: 'background 0.18s ease',
        cursor: 'pointer',
      }),
    })
  }

  return h(
    'div',
    { class: 'row', style: { justifyContent: 'center', gap: '20px', padding: '30px' } },
    tile('#4ade80'),
    tile('#60a5fa'),
    tile('#a78bfa'),
  )
}
