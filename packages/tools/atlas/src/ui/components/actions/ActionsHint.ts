import { txt } from '../../kit'

export const ActionsHint = txt
  .attrs({
    tag: 'span',
  })
  .theme((t) => ({
    fontSize: t.size.body,
    color: t.muted,
  }))
