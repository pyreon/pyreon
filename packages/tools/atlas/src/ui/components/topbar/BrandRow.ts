import { el } from '../../kit'

export const BrandRow = el
  .attrs({
    tag: 'div',
  })
  .theme(() => ({
    flexDirection: 'row',
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
    minWidth: '192px',
  }))
