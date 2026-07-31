import { txt, type T } from '../../kit'

export const ActionDetail = txt
  .attrs({
    tag: 'span',
  })
  .theme((t: T) => ({
    fontSize: t.size.body,
    flex: '1',
    color: t.muted,
  }))
