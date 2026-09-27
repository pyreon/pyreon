import { txt } from '../../kit'

export const StatusDim = txt
  .attrs({
    tag: 'span',
  })
  .theme((t) => ({
    color: t.border,
  }))
