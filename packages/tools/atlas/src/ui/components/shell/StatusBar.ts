import { el, type T } from '../../kit'

export const StatusBar = el
  .attrs({
    tag: 'footer',
  })
  .theme((t: T) => ({
    height: '30px',
    flex: 'none',
    display: 'flex',
    alignItems: 'center',
    gap: '14px',
    padding: '0 16px',
    fontFamily: t.font.mono,
    fontSize: t.size.meta,
    borderTop: t.hairline,
    background: t.surface,
    color: t.faint,
  }))
