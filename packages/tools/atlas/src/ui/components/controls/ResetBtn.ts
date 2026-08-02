import { el, type T } from '../../kit'

export const ResetBtn = el
  .attrs({
    tag: 'button',
  })
  .theme((t: T) => ({
    font: 'inherit',
    fontSize: t.size.body,
    cursor: 'pointer',
    width: '100%',
    marginTop: '4px',
    padding: '8px',
    borderRadius: t.radius.button,
    border: `1px dashed ${t.border}`,
    background: 'transparent',
    color: t.muted,
    hover: { borderColor: t.accent, color: t.text },
  }))
