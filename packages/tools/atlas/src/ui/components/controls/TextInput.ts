import type { InputEl } from '../../kit'
import { el } from '../../kit'

export const TextInput = el
  .attrs({
    tag: 'input',
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
    extendCss: `&::placeholder{color:${t.faint};opacity:1;}&[readonly]{color:${t.muted};}`,
  })) as unknown as InputEl
