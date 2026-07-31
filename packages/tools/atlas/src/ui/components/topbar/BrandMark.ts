import { el, type T } from '../../kit'

export const BrandMark = el
  .attrs({
    tag: 'div',
    css: 'display:flex;align-items:center;justify-content:center;',
  })
  .theme((t: T) => ({
    width: '30px',
    height: '30px',
    borderRadius: t.radius.field,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    background: t.accent,
    boxShadow: `0 4px 12px ${t.accentSoft}`,
  }))
