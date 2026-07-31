import { el, type T } from '../../kit'

export const IconButton = el
  .attrs({
    tag: 'button',
    css: 'display:flex;align-items:center;justify-content:center;',
  })
  .theme((t: T) => ({
    font: 'inherit',
    cursor: 'pointer',
    width: '34px',
    height: '34px',
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
