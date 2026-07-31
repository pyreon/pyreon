import { el } from '../../kit'

export const Main = el
  .attrs({
    tag: 'main',
    css: 'display:flex;flex-direction:column;align-items:stretch;',
  })
  .theme(() => ({
    flex: '1',
    display: 'flex',
    flexDirection: 'column',
    minWidth: '0',
    minHeight: '0',
  }))
