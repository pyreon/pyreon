import { txt, type T } from '../../kit'

export const ActionsHint = txt
  .attrs({
    tag: 'span',
  })
  .theme((t: T) => ({
    fontSize: t.size.body,
    color: t.muted,
  }))
