import { el, type T } from '../../kit'

export const A11yStat = el
  .attrs({
    tag: 'div',
  })
  .theme((t: T) => ({
    flexDirection: 'row',
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    fontSize: t.size.text,
    color: t.text,
  }))
