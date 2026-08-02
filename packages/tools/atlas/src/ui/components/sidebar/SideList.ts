import { el } from '../../kit'

export const SideList = el
  .attrs({
    tag: 'div',
  })
  .theme(() => ({
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'stretch',
    flex: '1',
    overflowY: 'auto',
    padding: '0 8px 16px',
  }))
