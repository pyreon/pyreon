import { txt, type T } from '../../kit'

export const StatusDim = txt
  .attrs({
    tag: 'span',
  })
  .theme((t: T) => ({
    color: t.border,
  }))
