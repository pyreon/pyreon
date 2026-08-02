import { el } from '../../kit'

export const Col = el
  .attrs({
    tag: 'div',
    contentDirection: 'rows',
  })
  .theme(() => ({
    lineHeight: '1.1',
  }))
