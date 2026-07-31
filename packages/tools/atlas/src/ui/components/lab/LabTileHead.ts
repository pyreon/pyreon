import { el, type T } from '../../kit'

export const LabTileHead = el
  .attrs({
    tag: 'div',
    css: 'display:flex;flex-direction:row;align-items:center;justify-content:space-between;width:100%;',
  })
  .theme((t: T) => ({
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '8px 12px',
    background: t.chrome,
    borderBottom: t.hairline,
  }))
