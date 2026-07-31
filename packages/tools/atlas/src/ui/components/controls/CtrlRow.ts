import { el } from '../../kit'

export const CtrlRow = el
  .attrs({
    tag: 'div',
    css: 'display:flex;flex-direction:column;align-items:stretch;',
  })
  .theme(() => ({
    marginBottom: '16px',
    extendCss: 'animation:atlas-in .18s;',
  }))
