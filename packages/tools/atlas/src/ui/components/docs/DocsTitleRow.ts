import { el } from '../../kit'

export const DocsTitleRow = el
  .attrs({
    tag: 'div',
  })
  .theme(() => ({
    flexDirection: 'row',
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    marginBottom: '8px',
  }))
