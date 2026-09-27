import { el } from '../../kit'

export const ActionsEmpty = el
  .attrs({
    tag: 'div',
  })
  .theme((t) => ({
    textAlign: 'center',
    padding: '40px 12px',
    fontSize: t.size.input,
    borderRadius: t.radius.card,
    color: t.faint,
    border: `1px dashed ${t.border}`,
  }))
