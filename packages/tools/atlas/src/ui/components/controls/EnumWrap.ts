import { el } from '../../kit'

export const EnumWrap = el
  .attrs({
    tag: 'div',
  })
  .theme(() => ({
    flexDirection: 'row',
    display: 'flex',
    flexWrap: 'wrap',
    gap: '4px',
  }))
