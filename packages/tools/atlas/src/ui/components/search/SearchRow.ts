import { el } from '../../kit'

export const SearchRow = el
  .attrs({ tag: 'button', contentDirection: 'inline', contentAlignY: 'center', gap: 12, block: true })
  .states(
    (t) => ({
      active: { background: t.accentSoft },
      idle: { background: 'transparent', hover: { background: t.surface2 } },
    }),
  )
  .theme((t) => ({
    font: 'inherit', cursor: 'pointer', textAlign: 'left', border: 'none',
    padding: '8px 12px', borderRadius: t.radius.button, color: t.text,
  }))
