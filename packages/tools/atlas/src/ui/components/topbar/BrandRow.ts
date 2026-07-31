import { el } from '../../kit'

export const BrandRow = el
  .attrs({
    tag: 'div',
    css: 'display:flex;flex-direction:row;align-items:center;',
  })
  .theme(() => ({
    display: 'flex',
    alignItems: 'center',
    gap: '11px',
    minWidth: '190px',
  }))
