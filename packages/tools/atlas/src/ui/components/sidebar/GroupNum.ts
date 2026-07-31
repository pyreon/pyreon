import { txt, type T } from '../../kit'

export const GroupNum = txt
  .attrs({
    tag: 'span',
  })
  .theme((t: T) => ({
    fontFamily: t.font.mono,
    fontSize: t.size.label,
    color: t.accent,
  }))
