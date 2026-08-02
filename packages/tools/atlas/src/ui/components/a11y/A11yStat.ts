import { el, type T } from '../../kit'

export const A11yStat = el
  .attrs({
    tag: 'div',
    contentDirection: 'inline',
    contentAlignY: 'center',
    gap: 8,
  })
  .theme((t: T) => ({
    fontSize: t.size.text,
    color: t.text,
  }))
