import { el } from '../../kit'

/** The 48px app bar — one row at every width. */
export const TopBar = el
  .attrs({
    tag: 'header',
    contentDirection: 'inline',
    contentAlignY: 'center',
    gap: 10,
  })
  .theme((t) => ({
    height: '48px',
    flex: 'none',
    minWidth: '0',
    padding: '0 10px 0 14px',
    zIndex: '10',
    borderBottom: t.hairline,
    background: t.surface,
  }))
