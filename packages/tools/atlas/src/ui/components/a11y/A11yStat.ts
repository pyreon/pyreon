import { el, type T } from '../../kit'

export const A11yStat = el
  .attrs({
    tag: 'div',
    css: 'display:flex;flex-direction:row;align-items:center;',
  })
  .theme((t: T) => ({
    display: 'flex',
    alignItems: 'center',
    gap: '7px',
    fontSize: t.size.text,
    color: t.text,
  }))
