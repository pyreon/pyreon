import { el, type T } from '../../kit'

export const GroupLabel = el
  .attrs({
    tag: 'div',
    css: 'display:flex;flex-direction:row;align-items:center;',
  })
  .theme((t: T) => ({
    margin: '14px 0 5px',
    padding: '0 8px',
    fontSize: t.size.caption,
    fontWeight: '700',
    letterSpacing: t.tracking.xs,
    display: 'flex',
    alignItems: 'center',
    gap: '7px',
    color: t.muted,
  }))
