import { dim, el, type T } from '../../kit'

export const SearchRow = el
  .attrs({ tag: 'button', contentDirection: 'inline', contentAlignY: 'center', gap: 12, block: true })
  .states(
    dim((t) => ({
      active: { background: t.accentSoft },
      idle: { background: 'transparent', hover: { background: t.surface2 } },
    })),
  )
  .theme((t: T) => ({
    font: 'inherit', cursor: 'pointer', textAlign: 'left', border: 'none',
    padding: '8px 12px', borderRadius: t.radius.button, color: t.text,
  }))
