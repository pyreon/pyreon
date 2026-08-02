import { el, type T } from '../../kit'

export const TopBar = el
  .attrs({
    tag: 'header',
  })
  .theme((t: T) => ({
    flexDirection: 'row',
    height: '56px',
    flex: 'none',
    display: 'flex',
    alignItems: 'center',
    gap: '16px',
    padding: '0 16px',
    zIndex: '10',
    borderBottom: t.hairline,
    background: t.surface,
  }))
