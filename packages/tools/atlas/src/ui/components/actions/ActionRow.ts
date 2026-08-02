import { el, type T } from '../../kit'

export const ActionRow = el
  .attrs({
    tag: 'div',
    contentDirection: 'inline',
    contentAlignY: 'center',
    gap: 8,
  })
  .theme((t: T) => ({
    padding: '8px 12px',
    borderRadius: t.radius.field,
    marginBottom: '8px',
    background: t.surface2,
    extendCss: 'animation:atlas-in .18s;',
  }))
