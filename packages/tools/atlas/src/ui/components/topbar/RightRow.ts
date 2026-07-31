import { el } from '../../kit'

export const RightRow = el
  .attrs({
    tag: 'div',
    css: 'display:flex;flex-direction:row;align-items:center;justify-content:flex-end;',
  })
  .theme(() => ({
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
    minWidth: '190px',
    justifyContent: 'flex-end',
  }))
