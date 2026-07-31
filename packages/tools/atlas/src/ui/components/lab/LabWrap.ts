import { el, type T } from '../../kit'

export const LabWrap = el
  .attrs({
    tag: 'div',
    css: 'display:flex;flex-direction:column;align-items:stretch;',
  })
  .theme((t: T) => ({
    flex: '1',
    overflowY: 'auto',
    padding: '28px 32px',
    background: t.bg,
  }))
