import { el } from '../../kit'

export const LabTileHead = el
  .attrs({
    tag: 'div',
    contentDirection: 'inline',
    contentAlignY: 'center',
    contentAlignX: 'spaceBetween',
  })
  .theme((t) => ({
    width: '100%',
    padding: '8px 12px',
    background: t.chrome,
    borderBottom: t.hairline,
  }))
