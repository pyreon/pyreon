import { el } from '../../kit'

export const SideHead = el
  .attrs({
    tag: 'div',
    css: 'display:flex;flex-direction:row;align-items:center;justify-content:space-between;',
  })
  .theme(() => ({
    padding: '14px 16px 10px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
  }))
