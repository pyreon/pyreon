import { txt } from '../../kit'

export const ActionName = txt
  .attrs({
    tag: 'span',
  })
  .theme((t) => ({
    fontFamily: t.font.mono,
    fontSize: t.size.caption,
    fontWeight: '600',
    color: t.accent,
  }))
