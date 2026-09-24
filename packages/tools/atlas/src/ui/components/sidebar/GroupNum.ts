import { txt } from '../../kit'

export const GroupNum = txt
  .attrs({
    tag: 'span',
  })
  .theme((t) => ({
    fontFamily: t.font.mono,
    fontSize: t.size.label,
    color: t.accent,
  }))
