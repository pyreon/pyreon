import { txt } from '../../kit'

export const A11yNote = txt
  .attrs({
    tag: 'div',
  })
  .theme((t) => ({
    fontSize: t.size.small,
    lineHeight: '1.45',
    color: t.muted,
  }))
