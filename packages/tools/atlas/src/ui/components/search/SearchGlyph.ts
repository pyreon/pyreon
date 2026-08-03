import { txt, type T } from '../../kit'

export const SearchGlyph = txt
  .attrs({ tag: 'span' })
  .theme((t: T) => ({ fontSize: '16px', color: t.faint }))
