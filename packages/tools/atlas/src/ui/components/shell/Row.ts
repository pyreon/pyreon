import { el } from '../../kit'

export const Row = el
  .attrs({
    tag: 'div',
  })
  .theme(() => ({
    flexDirection: 'row',
    display: 'flex',
    alignItems: 'center',
  }))
