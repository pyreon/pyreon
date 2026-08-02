import { el, type T } from '../../kit'

export const A11yRow = el
  .attrs({
    tag: 'div',
    contentDirection: 'inline',
    contentAlignY: 'top',
    gap: 12,
  })
  .theme((t: T) => ({
    padding: '12px 12px',
    borderRadius: t.radius.panel,
    marginBottom: '8px',
    background: t.surface2,
  }))
