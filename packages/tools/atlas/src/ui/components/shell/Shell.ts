import { el, type T } from '../../kit'

export const Shell = el
  .attrs({
    tag: 'div',
    css: 'display:flex;flex-direction:column;align-items:stretch;',
  })
  .theme((t: T) => ({
    height: '100vh',
    display: 'flex',
    flexDirection: 'column',
    overflow: 'hidden',
    fontSize: t.size.heading,
    background: t.bg,
    color: t.text,
  }))
