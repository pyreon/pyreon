import { el } from '../../kit'

export const A11yBody = el
  .attrs({
    tag: 'div',
    css: 'display:flex;flex-direction:column;align-items:stretch;',
  })
  .theme(() => ({
    flex: '1',
  }))
