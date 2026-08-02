import { el } from '../../kit'

export const RightRow = el
  .attrs({
    tag: 'div',
  })
  .theme(() => ({
    flexDirection: 'row',
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    minWidth: '192px',
    justifyContent: 'flex-end',
  }))
