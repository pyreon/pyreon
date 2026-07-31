import { txt, type T } from '../../kit'

export const ActionName = txt
  .attrs({
    tag: 'span',
  })
  .theme((t: T) => ({
    fontFamily: t.font.mono,
    fontSize: t.size.caption,
    fontWeight: '600',
    color: t.accent,
  }))
