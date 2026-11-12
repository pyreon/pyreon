import { el } from '../../kit'

/**
 * A panel's lead note (`.callout2`): what the panel shows and its one action
 * (Clear, Run axe, Record). Wraps on a narrow panel.
 */
export const ActionsHead = el
  .attrs({
    tag: 'div',
    contentDirection: 'inline',
    contentAlignY: 'center',
    contentAlignX: 'spaceBetween',
    gap: 10,
  })
  .theme((t) => ({
    flexWrap: 'wrap',
    margin: '10px 12px',
    padding: '10px 12px',
    borderRadius: t.radius.panel,
    border: t.hairline,
    background: t.surface2,
    fontSize: t.size.body,
    lineHeight: '1.55',
    color: t.muted,
  }))
  .variants((t) => ({
    accent: { borderColor: `color-mix(in srgb, ${t.accent} 40%, ${t.border})`, backgroundColor: t.glow },
    danger: { borderColor: `color-mix(in srgb, ${t.danger} 45%, ${t.border})` },
    plain: {},
  }))
