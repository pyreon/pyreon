import { txt } from '../../kit'

export const RangeVal = txt
  .attrs({
    tag: 'span',
  })
  .theme((t) => ({
    fontFamily: t.font.mono,
    fontSize: t.size.body,
    width: '32px',
    textAlign: 'right',
    color: t.muted,
  }))
