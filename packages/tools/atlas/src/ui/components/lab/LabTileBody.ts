import { el, type T } from '../../kit'

export const LabTileBody = el
  .attrs({
    tag: 'div',
  })
  .theme((t: T) => ({
    width: '100%',
    padding: '32px 20px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: '128px',
    background: t.bg,
  }))
