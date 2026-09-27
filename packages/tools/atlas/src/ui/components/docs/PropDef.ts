import { txt } from '../../kit'

export const PropDef = txt
  .attrs({
    tag: 'span',
  })
  .theme((t) => ({
    fontFamily: t.font.mono,
    color: t.muted,
  }))
