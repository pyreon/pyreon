import { el, type T } from '../../kit'

export const LabTileHead = el
  .attrs({
    tag: 'div',
  })
  .theme((t: T) => ({
    flexDirection: 'row',
    width: '100%',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '8px 12px',
    background: t.chrome,
    borderBottom: t.hairline,
  }))
