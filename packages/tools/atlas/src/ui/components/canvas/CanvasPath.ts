import { txt } from '../../kit'

export const CanvasPath = txt
  .attrs({
    tag: 'span',
  })
  .theme((t) => ({
    fontFamily: t.font.mono,
    fontSize: t.size.label,
    color: t.faint,
  }))
