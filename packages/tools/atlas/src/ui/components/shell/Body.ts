import { el } from '../../kit'

export const Body = el
  .attrs({
    tag: 'div',
  })
  .theme(() => ({
    display: 'flex',
    flexDirection: 'row',
    alignItems: 'stretch',
    flex: '1',
    minHeight: '0',
  }))
