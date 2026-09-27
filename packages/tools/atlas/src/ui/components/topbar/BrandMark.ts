import { el } from '../../kit'

export const BrandMark = el
  .attrs({
    tag: 'div',
    contentAlignX: 'center',
    contentAlignY: 'center',
  })
  .theme((t) => ({
    width: '32px',
    height: '32px',
    borderRadius: t.radius.field,
    background: t.accent,
    boxShadow: `0 4px 12px ${t.accentSoft}`,
  }))
