import { txt, type T } from '../../kit'

export const NewTag = txt
  .attrs({
    tag: 'span',
  })
  .theme((t: T) => ({
    fontSize: t.size.nano,
    fontWeight: '700',
    letterSpacing: t.tracking.md,
    padding: '2px 6px',
    borderRadius: t.radius.chip,
    color: t.accent,
    background: t.accentSoft,
  }))
