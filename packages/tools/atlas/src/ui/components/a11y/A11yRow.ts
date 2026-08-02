import { el, type T } from '../../kit'

export const A11yRow = el
  .attrs({
    tag: 'div',
  })
  .theme((t: T) => ({
    flexDirection: 'row',
    alignItems: 'flex-start',
    display: 'flex',
    gap: '12px',
    padding: '12px 12px',
    borderRadius: t.radius.panel,
    marginBottom: '8px',
    background: t.surface2,
  }))
