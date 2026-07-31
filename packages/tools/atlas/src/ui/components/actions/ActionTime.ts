import { txt, type T } from '../../kit'

export const ActionTime = txt
  .attrs({
    tag: 'span',
  })
  .theme((t: T) => ({
    fontFamily: t.font.mono,
    fontSize: t.size.label,
    color: t.faint,
  }))
