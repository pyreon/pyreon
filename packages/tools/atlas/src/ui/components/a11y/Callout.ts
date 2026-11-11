import { txt } from '../../kit'

/**
 * A finding's explanation or fix (`.callout2`): a tinted note between rows —
 * the Lens's "Fix:", a Permissions verdict. `acc` is the accent tint (a fix
 * to apply), `danger` a failure, `plain` an explanation.
 */
export const Callout = txt
  .attrs({ tag: 'div', block: true })
  .theme((t) => ({
    margin: '8px 12px',
    padding: '9px 12px',
    borderRadius: t.radius.panel,
    border: t.hairline,
    fontSize: t.size.small,
    lineHeight: '1.55',
    color: t.muted,
    overflowWrap: 'anywhere',
  }))
  .states((t) => ({
    acc: {
      background: t.glow,
      extendCss: `border-color:color-mix(in srgb, ${t.accent} 35%, transparent);`,
    },
    danger: {
      extendCss: `border-color:color-mix(in srgb, ${t.danger} 45%, transparent);background:color-mix(in srgb, ${t.danger} 6%, transparent);`,
    },
    plain: {},
  }))
