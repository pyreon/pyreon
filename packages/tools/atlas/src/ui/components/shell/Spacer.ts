import { el } from '../../kit'

export const Spacer = el
  .attrs({
    tag: 'div',
  })
  .theme(() => ({
    flex: '1',
    minWidth: '8px',
  }))
