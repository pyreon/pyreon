import { txt, type T } from '../../kit'

export const GroupCount = txt
  .attrs({
    tag: 'span',
  })
  .theme((t: T) => ({
    fontFamily: t.font.mono,
    fontSize: t.size.nano,
    color: t.faint,
  }))
