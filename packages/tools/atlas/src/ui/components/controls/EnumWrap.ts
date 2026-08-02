import { el } from '../../kit'

export const EnumWrap = el
  .attrs({
    tag: 'div',
    contentDirection: 'inline',
    gap: 4,
  })
  .theme(() => ({
    flexWrap: 'wrap',
  }))
