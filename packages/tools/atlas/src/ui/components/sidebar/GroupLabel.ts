import { el, type T } from '../../kit'

export const GroupLabel = el
  .attrs({
    tag: 'div',
    contentDirection: 'inline',
    contentAlignY: 'center',
    gap: 8,
  })
  .theme((t: T) => ({
    margin: '16px 0 4px',
    padding: '0 8px',
    fontSize: t.size.caption,
    fontWeight: '700',
    letterSpacing: t.tracking.xs,
    color: t.muted,
  }))
