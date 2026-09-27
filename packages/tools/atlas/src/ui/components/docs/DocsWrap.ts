import { el } from '../../kit'

export const DocsWrap = el
  .attrs({
    tag: 'div',
    contentDirection: 'rows',
    contentAlignX: 'block',
  })
  .theme((t) => ({
    flex: '1',
    overflowY: 'auto',
    padding: '36px 32px',
    background: t.bg,
  }))
