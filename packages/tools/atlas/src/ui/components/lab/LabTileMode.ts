import { txt } from '../../kit'

export const LabTileMode = txt
  .attrs({
    tag: 'span',
  })
  .theme((t) => ({
    fontFamily: t.font.mono,
    fontSize: t.size.tag,
    letterSpacing: t.tracking.lg,
    color: t.muted,
  }))
