import { el } from '../../kit'

export const SearchWrap = el
  .attrs({
    tag: 'div',
  })
  .theme(() => ({
    flexDirection: 'row',
    flex: '1',
    display: 'flex',
    justifyContent: 'center',
  }))
