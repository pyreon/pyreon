import { el } from '../../kit'

export const LabWrap = el
  .attrs({
    tag: 'div',
    contentDirection: 'rows',
    contentAlignX: 'block',
  })
  .theme((t) => ({
    flex: '1',
    overflowY: 'auto',
    padding: '28px 32px',
    background: t.bg,
  }))
