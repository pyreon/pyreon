import { el } from '../../kit'

export const Body = el
  .attrs({
    tag: 'div',
    contentDirection: 'inline',
    contentAlignY: 'block',
  })
  .theme(() => ({
    flex: '1',
    minHeight: '0',
  }))
