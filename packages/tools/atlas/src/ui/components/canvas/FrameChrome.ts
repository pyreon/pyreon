import { el, type T } from '../../kit'

export const FrameChrome = el
  .attrs({
    tag: 'div',
  })
  .theme((t: T) => ({
    flexDirection: 'row',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '8px 16px',
    borderBottom: t.hairline,
    background: t.chrome,
    fontFamily: t.font.mono,
    fontSize: t.size.label,
    color: t.muted,
  }))
