import { el } from '../../kit'

export const AddonBody = el
  .attrs({
    tag: 'div',
  })
  .theme(() => ({
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'stretch',
    flex: '1',
    overflowY: 'auto',
    padding: '16px',
  }))
