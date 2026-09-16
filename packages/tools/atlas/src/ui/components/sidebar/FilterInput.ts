import { el, type InputEl, type T } from '../../kit'

/**
 * The sidebar's persistent filter — a narrow sibling of the top bar's search
 * field. Persistent is the point: the ⌘K dialog's query is cleared on every
 * exit, so a tree filtered by it was a tree that could never stay filtered.
 */
export const FilterInput = el
  .attrs({ tag: 'input' })
  .theme((t: T) => ({
    font: 'inherit',
    fontSize: t.size.label,
    width: '100%',
    padding: '6px 10px',
    margin: '0 0 6px',
    borderRadius: t.radius.field,
    outline: 'none',
    border: t.hairline,
    background: t.bg,
    color: t.text,
    transition: `border-color ${t.motion.base},box-shadow ${t.motion.base}`,
    focus: {
      borderColor: t.accent,
      boxShadow: `0 0 0 3px ${t.accentSoft}`,
    },
  })) as unknown as InputEl
