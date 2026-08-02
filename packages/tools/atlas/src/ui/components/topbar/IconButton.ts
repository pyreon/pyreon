import { el, type T } from '../../kit'

export const IconButton = el
  .attrs({
    tag: 'button',
  })
  .theme((t: T) => ({
    font: 'inherit',
    cursor: 'pointer',
    width: '32px',
    height: '32px',
    borderRadius: t.radius.field,
    fontSize: t.size.title,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    border: t.hairline,
    background: t.bg,
    color: t.text,
    hover: { borderColor: t.accent },
  }))
