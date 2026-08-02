import { el } from '../../kit'

export const Main = el
  .attrs({
    tag: 'main',
  })
  .theme(() => ({
    alignItems: 'stretch',
    flex: '1',
    display: 'flex',
    flexDirection: 'column',
    minWidth: '0',
    minHeight: '0',
  }))
