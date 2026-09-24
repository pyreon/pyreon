import { txt } from '../../kit'

export const DocsStatus = txt
  .attrs({
    tag: 'span',
  })
  .theme((t) => ({
    fontSize: t.size.caption,
    fontWeight: '700',
    letterSpacing: t.tracking.md,
    padding: '4px 8px',
    borderRadius: t.radius.control,
    textTransform: 'capitalize',
    color: t.accent,
    background: t.accentSoft,
  }))
