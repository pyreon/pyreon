import { el } from '../../kit'

export const CtrlHead = el
  .attrs({
    tag: 'div',
    css: 'display:flex;flex-direction:row;align-items:center;justify-content:space-between;',
  })
  .theme(() => ({
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: '7px',
  }))
