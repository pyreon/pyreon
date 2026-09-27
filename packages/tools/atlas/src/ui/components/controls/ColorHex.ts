import { txt } from '../../kit'

export const ColorHex = txt
  .attrs({
    tag: 'span',
  })
  .theme((t) => ({
    fontFamily: t.font.mono,
    fontSize: t.size.small,
    color: t.muted,
  }))
