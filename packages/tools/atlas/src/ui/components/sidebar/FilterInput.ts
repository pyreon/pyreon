import { el, type InputEl } from '../../kit'

/**
 * The sidebar's persistent filter — a narrow sibling of the top bar's search
 * field. Persistent is the point: the ⌘K dialog's query is cleared on every
 * exit, so a tree filtered by it was a tree that could never stay filtered.
 */
export const FilterInput = el
  .attrs({ tag: 'input' })
  .theme((t) => ({
    font: 'inherit',
    fontSize: t.size.text,
    width: '100%',
    padding: '8px 12px',
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
    // Its own ring above — the global focus-visible OUTLINE on top of it drew
    // a second, square ring outside the rounded field.
    extendCss: `&:focus-visible{outline:none;}&::placeholder{color:${t.faint};}`,
  })) as unknown as InputEl
