import { el, type T } from '../../kit'

export const LabTileBody = el
  .attrs({
    tag: 'div',
    css: 'display:flex;align-items:center;justify-content:center;width:100%;',
  })
  .theme((t: T) => ({
    padding: '34px 20px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: '130px',
    background: t.bg,
  }))
