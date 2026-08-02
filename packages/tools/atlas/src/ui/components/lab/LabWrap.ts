import { el, type T } from '../../kit'

export const LabWrap = el
  .attrs({
    tag: 'div',
  })
  .theme((t: T) => ({
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'stretch',
    flex: '1',
    overflowY: 'auto',
    padding: '28px 32px',
    background: t.bg,
  }))
