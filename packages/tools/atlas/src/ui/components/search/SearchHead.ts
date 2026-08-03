import { el, type T } from '../../kit'

export const SearchHead = el
  .attrs({ tag: 'div', contentDirection: 'inline', contentAlignY: 'center', gap: 8 })
  .theme((t: T) => ({ padding: '4px 16px', borderBottom: t.hairline, flex: 'none' }))
