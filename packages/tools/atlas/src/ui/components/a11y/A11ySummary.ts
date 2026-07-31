import { el, type T } from '../../kit'

export const A11ySummary = el
  .attrs({
    tag: 'div',
    css: 'display:flex;flex-direction:row;align-items:center;',
  })
  .theme((t: T) => ({
    display: 'flex',
    gap: '16px',
    marginBottom: '16px',
    padding: '14px',
    borderRadius: t.radius.card,
    border: t.hairline,
  }))
