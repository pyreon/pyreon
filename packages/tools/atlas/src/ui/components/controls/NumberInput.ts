import type { InputEl } from '../../kit'
import { el } from '../../kit'

/** Number editor — the TextInput look with the native spinner. */
export const NumberInput = el
  .attrs({
    tag: 'input',
    type: 'number',
  })
  .theme((t) => ({
    font: 'inherit',
    fontSize: t.size.body,
    width: '100%',
    minWidth: '0',
    height: '28px',
    padding: '0 8px',
    borderRadius: t.radius.field,
    border: t.hairline,
    background: t.bg,
    color: t.text,
    focus: { borderColor: t.accent },
  })) as unknown as InputEl
