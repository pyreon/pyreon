import { el, type T } from '../../kit'

export const LabTileBody = el
  .attrs({
    tag: 'div',
    contentAlignX: 'center',
    contentAlignY: 'center',
  })
  .theme((t: T) => ({
    width: '100%',
    padding: '32px 20px',
    minHeight: '128px',
    background: t.bg,
  }))
