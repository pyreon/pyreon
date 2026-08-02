import { el, type T } from '../../kit'

export const DocsWrap = el
  .attrs({
    tag: 'div',
  })
  .theme((t: T) => ({
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'stretch',
    flex: '1',
    overflowY: 'auto',
    padding: '36px 32px',
    background: t.bg,
  }))
