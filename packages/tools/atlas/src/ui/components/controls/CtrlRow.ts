import { el } from '../../kit'

export const CtrlRow = el
  .attrs({
    tag: 'div',
  })
  .theme(() => ({
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'stretch',
    marginBottom: '16px',
    extendCss: 'animation:atlas-in .18s;',
  }))
