import { el, type T } from '../../kit'

export const BrandMark = el
  .attrs({
    tag: 'div',
  })
  .theme((t: T) => ({
    width: '32px',
    height: '32px',
    borderRadius: t.radius.field,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    background: t.accent,
    boxShadow: `0 4px 12px ${t.accentSoft}`,
  }))
