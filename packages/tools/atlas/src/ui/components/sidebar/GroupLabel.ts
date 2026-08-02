import { el, type T } from '../../kit'

export const GroupLabel = el
  .attrs({
    tag: 'div',
  })
  .theme((t: T) => ({
    flexDirection: 'row',
    margin: '16px 0 4px',
    padding: '0 8px',
    fontSize: t.size.caption,
    fontWeight: '700',
    letterSpacing: t.tracking.xs,
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    color: t.muted,
  }))
