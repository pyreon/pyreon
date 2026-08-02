import { el, type T } from '../../kit'

export const StatusBar = el
  .attrs({
    tag: 'footer',
    contentDirection: 'inline',
    contentAlignY: 'center',
    gap: 16,
  })
  .theme((t: T) => ({
    height: '32px',
    flex: 'none',
    // Explicit: without it the Element wrapper's default column stacking
    // wins and the three status texts pile up centered (the "floating
    // path" artifact at the bottom of the shell).
    padding: '0 16px',
    fontFamily: t.font.mono,
    fontSize: t.size.meta,
    borderTop: t.hairline,
    background: t.surface,
    color: t.faint,
  }))
