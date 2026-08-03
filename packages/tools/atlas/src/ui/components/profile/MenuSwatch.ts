/** The brand-theme color dot in a menu row — bg set per row via the css prop. */
import { el, type T } from '../../kit'

export const MenuSwatch = el
  .attrs({ tag: 'span' })
  .theme((t: T) => ({ width: '12px', height: '12px', borderRadius: t.radius.round, flex: 'none', border: t.hairline }))
