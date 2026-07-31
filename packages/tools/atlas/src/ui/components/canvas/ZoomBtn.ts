import { el, type T } from '../../kit'

export const ZoomBtn = el
  .attrs({
    tag: 'button',
  })
  .theme((t: T) => ({
    font: 'inherit',
    cursor: 'pointer',
    border: 'none',
    background: 'transparent',
    width: '26px',
    height: '26px',
    borderRadius: t.radius.control,
    fontSize: t.size.title,
    color: t.text,
    hover: { background: t.surface2 },
  }))
