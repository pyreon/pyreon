import type { InputEl } from '../../kit'
import { el } from '../../kit'

/**
 * The catalog's persistent filter. Persistent is the point: the ⌘K dialog's
 * query is cleared on every exit, so a tree filtered by it could never stay
 * filtered.
 */
export const FilterInput = el
  .attrs({ tag: 'input' })
  .theme((t) => ({
    font: 'inherit',
    fontSize: t.size.small,
    width: '100%',
    height: '28px',
    padding: '0 9px',
    borderRadius: t.radius.field,
    border: t.hairline,
    background: t.bg,
    color: t.text,
    transition: `border-color ${t.motion.base}`,
    focus: { borderColor: t.accent },
    extendCss: `&::placeholder{color:${t.faint};opacity:1;}`,
  })) as unknown as InputEl
