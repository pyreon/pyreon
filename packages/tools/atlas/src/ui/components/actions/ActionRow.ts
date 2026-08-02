import { el, type T } from '../../kit'

export const ActionRow = el
  .attrs({
    tag: 'div',
  })
  .theme((t: T) => ({
    flexDirection: 'row',
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    padding: '8px 12px',
    borderRadius: t.radius.field,
    marginBottom: '8px',
    background: t.surface2,
    extendCss: 'animation:atlas-in .18s;',
  }))
