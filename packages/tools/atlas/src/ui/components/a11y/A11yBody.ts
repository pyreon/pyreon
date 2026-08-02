import { el } from '../../kit'

export const A11yBody = el
  .attrs({
    tag: 'div',
  })
  .theme(() => ({
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'stretch',
    flex: '1',
  }))
