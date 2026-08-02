import { el, type T } from '../../kit'

export const TopBar = el
  .attrs({
    tag: 'header',
    contentDirection: 'inline',
    contentAlignY: 'center',
    gap: 16,
  })
  .theme((t: T) => ({
    height: '56px',
    flex: 'none',
    padding: '0 16px',
    zIndex: '10',
    borderBottom: t.hairline,
    background: t.surface,
  }))
