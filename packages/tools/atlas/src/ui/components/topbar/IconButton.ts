import { el, type T } from '../../kit'

export const IconButton = el
  .attrs({
    tag: 'button',
    contentAlignX: 'center',
    contentAlignY: 'center',
  })
  .theme((t: T) => ({
    font: 'inherit',
    cursor: 'pointer',
    width: '32px',
    height: '32px',
    borderRadius: t.radius.field,
    fontSize: t.size.title,
    border: t.hairline,
    background: t.bg,
    color: t.text,
    hover: { borderColor: t.accent },
  }))
