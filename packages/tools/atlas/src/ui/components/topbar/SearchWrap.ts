import { el } from '../../kit'

export const SearchWrap = el
  .attrs({
    tag: 'div',
    css: 'display:flex;flex-direction:row;justify-content:center;',
  })
  .theme(() => ({
    flex: '1',
    display: 'flex',
    justifyContent: 'center',
  }))
