import { el, type InputEl, type T } from '../../kit'

export const TextInput = el
  .attrs({
    tag: 'input',
  })
  .theme((t: T) => ({
    font: 'inherit',
    fontSize: t.size.input,
    width: '100%',
    padding: '8px 12px',
    borderRadius: t.radius.button,
    outline: 'none',
    border: t.hairline,
    background: t.bg,
    color: t.text,
    focus: { borderColor: t.accent, boxShadow: `0 0 0 3px ${t.accentSoft}` },
  })) as unknown as InputEl
