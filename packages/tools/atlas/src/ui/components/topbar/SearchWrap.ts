import { el } from '../../kit'

export const SearchWrap = el
  .attrs({
    tag: 'div',
    contentDirection: 'inline',
    contentAlignX: 'center',
  })
  .theme(() => ({
    flex: '1',
  }))
