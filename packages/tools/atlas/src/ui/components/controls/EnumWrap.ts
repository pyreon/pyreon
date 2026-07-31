import { el } from '../../kit'

export const EnumWrap = el
  .attrs({
    tag: 'div',
    css: 'display:flex;flex-direction:row;flex-wrap:wrap;',
  })
  .theme(() => ({
    display: 'flex',
    flexWrap: 'wrap',
    gap: '5px',
  }))
