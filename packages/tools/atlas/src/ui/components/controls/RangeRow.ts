import { el } from '../../kit'

export const RangeRow = el
  .attrs({
    tag: 'div',
  })
  .theme(() => ({
    flexDirection: 'row',
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
  }))
