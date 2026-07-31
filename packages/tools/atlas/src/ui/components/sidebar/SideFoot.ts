import { el, type T } from '../../kit'

export const SideFoot = el
  .attrs({
    tag: 'div',
    css: 'display:flex;flex-direction:row;align-items:center;',
  })
  .theme((t: T) => ({
    borderTop: t.hairline,
    padding: '12px 16px',
    display: 'flex',
    alignItems: 'center',
    gap: '9px',
    fontSize: t.size.small,
    color: t.muted,
  }))
