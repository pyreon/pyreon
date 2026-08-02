import { el, type T } from '../../kit'

export const ClearBtn = el
  .attrs({
    tag: 'button',
  })
  .theme((t: T) => ({
    font: 'inherit',
    fontSize: t.size.small,
    cursor: 'pointer',
    padding: '4px 8px',
    borderRadius: t.radius.item,
    border: t.hairline,
    background: t.bg,
    color: t.text,
    hover: { borderColor: t.accent },
  }))
