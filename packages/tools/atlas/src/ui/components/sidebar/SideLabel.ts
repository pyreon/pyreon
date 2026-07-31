import { txt, type T } from '../../kit'

export const SideLabel = txt
  .attrs({
    tag: 'span',
  })
  .theme((t: T) => ({
    fontFamily: t.font.mono,
    fontSize: t.size.label,
    letterSpacing: t.tracking.xxl,
    color: t.faint,
  }))
