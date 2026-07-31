import { el } from '../../kit'

export const RangeRow = el
  .attrs({
    tag: 'div',
    css: 'display:flex;flex-direction:row;align-items:center;',
  })
  .theme(() => ({
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
  }))
