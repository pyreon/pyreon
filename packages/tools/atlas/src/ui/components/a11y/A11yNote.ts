import { txt, type T } from '../../kit'

export const A11yNote = txt
  .attrs({
    tag: 'div',
  })
  .theme((t: T) => ({
    fontSize: t.size.small,
    lineHeight: '1.45',
    color: t.muted,
  }))
