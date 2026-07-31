import { el } from '../../kit'

export const Col = el
  .attrs({
    tag: 'div',
  })
  .theme(() => ({
    display: 'flex',
    flexDirection: 'column',
    lineHeight: '1.1',
  }))
