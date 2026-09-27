import { txt } from '../../kit'

export const ZoomLabel = txt
  .attrs({
    tag: 'span',
  })
  .theme((t) => ({
    fontFamily: t.font.mono,
    fontSize: t.size.caption,
    width: '40px',
    textAlign: 'center',
    color: t.muted,
  }))
