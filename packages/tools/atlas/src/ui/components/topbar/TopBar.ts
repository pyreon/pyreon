import { el } from '../../kit'

export const TopBar = el
  .attrs({
    tag: 'header',
    contentDirection: 'inline',
    contentAlignY: 'center',
    gap: 16,
  })
  .theme((t) => ({
    // A MINIMUM, so the bar can wrap: at phone width the brand, the view
    // segment, the search trigger and the avatar no longer fit one 56px row,
    // and a fixed height clipped whatever fell off the end.
    minHeight: '56px',
    flexWrap: 'wrap',
    flex: 'none',
    padding: '8px 16px',
    zIndex: '10',
    borderBottom: t.hairline,
    background: t.surface,
  }))
