import { el, type T } from '../../kit'

export const SearchFoot = el
  .attrs({ tag: 'div', contentDirection: 'inline', contentAlignY: 'center', gap: 12 })
  .theme((t: T) => ({
    padding: '8px 16px', borderTop: t.hairline, flex: 'none',
    fontFamily: t.font.mono, fontSize: t.size.nano, color: t.faint,
  }))
