/** Number editor — the TextInput look with the native spinner. */
import { el, type InputEl } from '../../kit'

export const NumberInput = el
  .attrs({
    tag: 'input',
    type: 'number',
  })
  .theme((t) => ({
    font: 'inherit',
    fontSize: t.size.input,
    width: '100%',
    padding: '8px 12px',
    borderRadius: t.radius.button,
    outline: 'none',
    border: t.hairline,
    background: t.bg,
    color: t.text,
    focus: { borderColor: t.accent },
  })) as unknown as InputEl
