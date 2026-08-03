import { el, type T } from '../../kit'

export const MenuDivider = el
  .attrs({ tag: 'div' })
  .theme((t: T) => ({ height: '1px', background: t.border, margin: '8px 4px' }))
