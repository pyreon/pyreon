import { el } from '../../kit'

export const SearchResults = el
  .attrs({ tag: 'div', contentDirection: 'rows', contentAlignX: 'block' })
  .theme(() => ({ overflowY: 'auto', padding: '8px', flex: '1' }))
