import { el, type T } from '../../kit'

export const PropsHead = el
  .attrs({
    tag: 'div',
  })
  .theme((t: T) => ({
    display: 'grid',
    gridTemplateColumns: '1.4fr 1fr 1fr',
    columnGap: '16px',
    padding: '8px 16px',
    background: t.surface2,
    fontSize: t.size.caption,
    fontWeight: '700',
    letterSpacing: t.tracking.sm,
    color: t.muted,
  }))
