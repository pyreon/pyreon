import { el, type T } from '../../kit'

export const TopBar = el
  .attrs({
    tag: 'header',
    css: 'display:flex;flex-direction:row;align-items:center;',
  })
  .theme((t: T) => ({
    height: '56px',
    flex: 'none',
    display: 'flex',
    alignItems: 'center',
    gap: '18px',
    padding: '0 18px',
    zIndex: '10',
    borderBottom: t.hairline,
    background: t.surface,
  }))
