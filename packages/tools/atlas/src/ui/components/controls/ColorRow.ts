import { el } from '../../kit'

export const ColorRow = el
  .attrs({
    tag: 'div',
  })
  .theme(() => ({
    flexDirection: 'row',
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
  }))
