import { el } from '../../kit'

export const A11yBody = el
  .attrs({
    tag: 'div',
    contentDirection: 'rows',
    contentAlignX: 'block',
  })
  .theme(() => ({
    flex: '1',
  }))
