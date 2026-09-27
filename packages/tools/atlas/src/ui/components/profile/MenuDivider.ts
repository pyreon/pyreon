import { el } from '../../kit'

export const MenuDivider = el
  .attrs({ tag: 'div' })
  .theme((t) => ({ height: '1px', background: t.border, margin: '8px 4px' }))
