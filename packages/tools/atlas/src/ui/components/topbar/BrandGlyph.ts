import { el } from '../../kit'

export const BrandGlyph = el
  .attrs({
    tag: 'div',
  })
  .theme((t) => ({
    width: '13px',
    height: '13px',
    borderRadius: t.radius.bar,
    background: '#fff',
    transform: 'rotate(45deg)',
  }))
