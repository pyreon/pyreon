import { el, type T } from '../../kit'

/** Expand / collapse an owned folder's parts — the count and a chevron. */
export const TreeToggle = el
  .attrs({ tag: 'button', contentDirection: 'inline', contentAlignY: 'center', gap: 4 })
  .theme((t: T) => ({
    font: 'inherit',
    cursor: 'pointer',
    flex: 'none',
    border: 'none',
    height: '28px',
    padding: '0 8px',
    borderRadius: t.radius.control,
    fontFamily: t.font.mono,
    fontSize: t.size.caption,
    color: t.faint,
    background: 'transparent',
    hover: { background: t.surface2, color: t.text },
  }))
