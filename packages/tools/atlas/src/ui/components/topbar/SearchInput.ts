import { el, type InputEl, type T } from '../../kit'

export const SearchInput = el
  .attrs({
    tag: 'input',
  })
  .theme((t: T) => ({
    font: 'inherit',
    fontSize: t.size.input,
    width: '100%',
    padding: '8px 16px 8px 32px',
    borderRadius: t.radius.field,
    outline: 'none',
    transition: `border-color ${t.motion.base},box-shadow ${t.motion.base}`,
    border: t.hairline,
    background: t.bg,
    color: t.text,
    focus: {
      borderColor: t.accent,
      boxShadow: `0 0 0 3px ${t.accentSoft}`,
    },
  })) as unknown as InputEl
