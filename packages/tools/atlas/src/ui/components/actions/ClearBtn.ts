import { el } from '../../kit'

export const ClearBtn = el
  .attrs({
    tag: 'button',
  })
  .theme((t) => ({
    font: 'inherit',
    flex: 'none',
    fontSize: t.size.small,
    cursor: 'pointer',
    height: '26px',
    padding: '0 10px',
    borderRadius: t.radius.button,
    border: `1px solid ${t.border2}`,
    background: t.surface,
    color: t.text,
    hover: { borderColor: t.accent },
  }))
