import { el } from '../../kit'

export const SwatchWrap = el
  .attrs({
    tag: 'div',
  })
  .theme(() => ({
    flexDirection: 'row',
    display: 'flex',
    flexWrap: 'wrap',
    gap: '8px',
  }))
