import { el, type T } from '../../kit'

export const Empty = el
  .attrs({
    tag: 'div',
    contentDirection: 'rows',
    contentAlignX: 'center',
  })
  .theme((t: T) => ({
    textAlign: 'center',
    padding: '44px 16px',
    color: t.faint,
    fontFamily: t.font.mono,
    fontSize: t.size.body,
    lineHeight: '1.6',
  }))
