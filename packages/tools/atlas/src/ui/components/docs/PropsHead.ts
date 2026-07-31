import { el, type T } from '../../kit'

export const PropsHead = el
  .attrs({
    tag: 'div',
    css: 'display:grid;grid-template-columns:1.4fr 1fr 1fr;column-gap:16px;align-items:center;',
  })
  .theme((t: T) => ({
    display: 'grid',
    gridTemplateColumns: '1.4fr 1fr 1fr',
    columnGap: '16px',
    padding: '10px 16px',
    background: t.surface2,
    fontSize: t.size.caption,
    fontWeight: '700',
    letterSpacing: t.tracking.sm,
    color: t.muted,
  }))
