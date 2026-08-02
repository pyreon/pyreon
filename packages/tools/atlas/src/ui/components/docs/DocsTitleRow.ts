import { el } from '../../kit'

export const DocsTitleRow = el
  .attrs({
    tag: 'div',
    contentDirection: 'inline',
    contentAlignY: 'center',
    gap: 8,
  })
  .theme(() => ({
    marginBottom: '8px',
  }))
