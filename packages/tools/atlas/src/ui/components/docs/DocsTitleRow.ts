import { el } from '../../kit'

export const DocsTitleRow = el
  .attrs({
    tag: 'div',
    css: 'display:flex;flex-direction:row;align-items:center;',
  })
  .theme(() => ({
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
    marginBottom: '10px',
  }))
