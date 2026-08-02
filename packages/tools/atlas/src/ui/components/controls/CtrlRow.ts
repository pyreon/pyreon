import { el } from '../../kit'

export const CtrlRow = el
  .attrs({
    tag: 'div',
    contentDirection: 'rows',
    contentAlignX: 'block',
  })
  .theme(() => ({
    marginBottom: '16px',
    extendCss: 'animation:atlas-in .18s;',
  }))
