import { el } from '../../kit'

export const SideList = el
  .attrs({
    tag: 'div',
    contentDirection: 'rows',
    contentAlignX: 'block',
  })
  .theme(() => ({
    flex: '1',
    minHeight: '0',
    overflowY: 'auto',
    padding: '4px 0 16px',
  }))
