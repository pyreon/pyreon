import { el, type T } from '../../kit'

export const ScenPlay = el
  .attrs({
    tag: 'button',
  })
  .theme((t: T) => ({
    font: 'inherit',
    cursor: 'pointer',
    border: 'none',
    background: 'transparent',
    flex: 'none',
    width: '24px',
    height: '24px',
    borderRadius: t.radius.control,
    fontSize: t.size.nano,
    color: t.accent,
    hover: { background: t.accentSoft },
  }))
