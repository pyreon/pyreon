/** Number editor — the TextInput look with the native spinner. */
import { el, type InputEl, type T } from '../../kit'

export const NumberInput = el
  .attrs({
    tag: 'input',
    type: 'number',
  })
  .theme((t: T) => ({
    font: 'inherit',
    fontSize: t.size.input,
    width: '100%',
    padding: '8px 11px',
    borderRadius: t.radius.button,
    outline: 'none',
    border: t.hairline,
    background: t.bg,
    color: t.text,
    focus: { borderColor: t.accent },
  })) as unknown as InputEl
