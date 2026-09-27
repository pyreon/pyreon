import { txt } from '../../kit'

export const ActionDetail = txt
  .attrs({
    tag: 'span',
  })
  .theme((t) => ({
    fontSize: t.size.body,
    flex: '1',
    color: t.muted,
  }))
