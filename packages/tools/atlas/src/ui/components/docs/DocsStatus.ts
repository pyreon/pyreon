import { txt, type T } from '../../kit'

export const DocsStatus = txt
  .attrs({
    tag: 'span',
  })
  .theme((t: T) => ({
    fontSize: t.size.caption,
    fontWeight: '700',
    letterSpacing: t.tracking.md,
    padding: '3px 9px',
    borderRadius: t.radius.control,
    textTransform: 'capitalize',
    color: t.accent,
    background: t.accentSoft,
  }))
