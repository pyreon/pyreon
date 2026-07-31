import { el, type T } from '../../kit'

export const FrameChrome = el
  .attrs({
    tag: 'div',
    css: 'display:flex;flex-direction:row;align-items:center;justify-content:space-between;',
  })
  .theme((t: T) => ({
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '9px 14px',
    borderBottom: t.hairline,
    background: t.chrome,
    fontFamily: t.font.mono,
    fontSize: t.size.label,
    color: t.muted,
  }))
