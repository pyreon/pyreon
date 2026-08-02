import { el } from '../../kit'

export const SideHead = el
  .attrs({
    tag: 'div',
  })
  .theme(() => ({
    flexDirection: 'row',
    padding: '16px 16px 8px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
  }))
