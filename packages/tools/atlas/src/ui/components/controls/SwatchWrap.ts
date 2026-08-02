import { el } from '../../kit'

export const SwatchWrap = el
  .attrs({
    tag: 'div',
    contentDirection: 'inline',
    gap: 8,
  })
  .theme(() => ({
    flexWrap: 'wrap',
  }))
