import type { InputEl } from '../../kit'
import { el } from '../../kit'

/** Native color picker beside its hex readout. */
export const ColorInput = el
  .attrs({
    tag: 'input',
    type: 'color',
  })
  .theme((t) => ({
    width: '28px',
    height: '28px',
    padding: '2px',
    border: t.hairline,
    borderRadius: t.radius.field,
    background: t.bg,
    cursor: 'pointer',
  })) as unknown as InputEl
