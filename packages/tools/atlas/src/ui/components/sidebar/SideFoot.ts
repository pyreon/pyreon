import { el, type T } from '../../kit'

export const SideFoot = el
  .attrs({
    tag: 'div',
    contentDirection: 'inline',
    contentAlignY: 'center',
    gap: 8,
  })
  .theme((t: T) => ({
    borderTop: t.hairline,
    padding: '12px 16px',
    fontSize: t.size.small,
    color: t.muted,
    // Keyboard hints mean nothing on a touch screen.
    extendCss: '@media (pointer:coarse){display:none;}',
  }))
