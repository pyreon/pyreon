/** Native color picker beside its hex readout. */
import { el, type InputEl, type T } from '../../kit'

export const ColorInput = el
  .attrs({
    tag: 'input',
    type: 'color',
  })
  .theme((t: T) => ({
    width: '32px',
    height: '32px',
    padding: '0',
    border: t.hairline,
    borderRadius: t.radius.item,
    background: t.bg,
    cursor: 'pointer',
  })) as unknown as InputEl
