import { el } from '../../kit'

export const ZoomBtn = el
  .attrs({
    tag: 'button',
  })
  .theme((t) => ({
    font: 'inherit',
    cursor: 'pointer',
    border: 'none',
    background: 'transparent',
    width: '24px',
    height: '24px',
    borderRadius: t.radius.control,
    fontSize: t.size.title,
    color: t.text,
    hover: { background: t.surface2 },
  }))
