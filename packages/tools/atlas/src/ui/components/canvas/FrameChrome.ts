import { el, type T } from '../../kit'

export const FrameChrome = el
  .attrs({
    tag: 'div',
    contentDirection: 'inline',
    contentAlignY: 'center',
    contentAlignX: 'spaceBetween',
  })
  .theme((t: T) => ({
    padding: '8px 16px',
    borderBottom: t.hairline,
    background: t.chrome,
    fontFamily: t.font.mono,
    fontSize: t.size.label,
    color: t.muted,
  }))
