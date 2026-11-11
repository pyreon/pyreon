import { el } from '../../kit'

/**
 * The card's role chip — a toggle that renders the CANVAS under this role
 * (pressed = the canvas's role).
 */
export const RoleToggle = el
  .attrs({ tag: 'button', contentAlignY: 'center', gap: 6 })
  .theme((t) => ({
    font: 'inherit',
    cursor: 'pointer',
    padding: '1px 8px',
    borderRadius: t.radius.chip,
    border: `1px solid ${t.border2}`,
    background: 'transparent',
    fontFamily: t.font.mono,
    fontSize: t.size.label,
    letterSpacing: t.tracking.sm,
    color: t.muted,
    alignSelf: 'flex-start',
    hover: { color: t.text },
  }))
  .states((t) => ({
    active: {
      color: t.accent,
      extendCss: `border-color:color-mix(in srgb, ${t.accent} 45%, transparent);`,
    },
    idle: {},
  }))
