import { el } from '../../kit'

export const Main = el
  .attrs({
    tag: 'main',
    contentDirection: 'rows',
    contentAlignX: 'block',
  })
  .theme(() => ({
    flex: '1',
    minWidth: '0',
    minHeight: '0',
  }))
