import { el, type T } from '../../kit'

export const SearchEmpty = el
  .attrs({ tag: 'div', contentDirection: 'rows', contentAlignX: 'center' })
  .theme((t: T) => ({ padding: '32px 16px', color: t.faint, fontSize: t.size.text, textAlign: 'center' }))
