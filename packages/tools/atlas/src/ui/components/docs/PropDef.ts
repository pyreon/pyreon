import { txt, type T } from '../../kit'

export const PropDef = txt
  .attrs({
    tag: 'span',
  })
  .theme((t: T) => ({
    fontFamily: t.font.mono,
    color: t.muted,
  }))
