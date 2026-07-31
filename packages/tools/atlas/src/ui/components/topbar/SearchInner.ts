import { el } from '../../kit'

export const SearchInner = el
  .attrs({
    tag: 'div',
  })
  .theme(() => ({
    position: 'relative',
    width: '100%',
    maxWidth: '420px',
  }))
