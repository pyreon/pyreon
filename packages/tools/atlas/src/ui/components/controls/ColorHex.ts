import { txt, type T } from '../../kit'

export const ColorHex = txt
  .attrs({
    tag: 'span',
  })
  .theme((t: T) => ({
    fontFamily: t.font.mono,
    fontSize: t.size.small,
    color: t.muted,
  }))
