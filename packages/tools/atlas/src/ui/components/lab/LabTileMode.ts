import { txt, type T } from '../../kit'

export const LabTileMode = txt
  .attrs({
    tag: 'span',
  })
  .theme((t: T) => ({
    fontFamily: t.font.mono,
    fontSize: t.size.tag,
    letterSpacing: t.tracking.lg,
    color: t.muted,
  }))
