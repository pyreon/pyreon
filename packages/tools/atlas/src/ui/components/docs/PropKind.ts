import { txt, type T } from '../../kit'

export const PropKind = txt
  .attrs({
    tag: 'span',
  })
  .theme((t: T) => ({
    fontFamily: t.font.mono,
    color: t.accent,
  }))
