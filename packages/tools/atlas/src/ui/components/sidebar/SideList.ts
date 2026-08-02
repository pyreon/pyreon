import { el } from '../../kit'

export const SideList = el
  .attrs({
    tag: 'div',
    contentDirection: 'rows',
    contentAlignX: 'block',
  })
  .theme(() => ({
    flex: '1',
    overflowY: 'auto',
    padding: '0 8px 16px',
  }))
