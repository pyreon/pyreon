import { txt } from '../../kit'

/** A small status chip (`.chip2`): `ok`, `danger`, `warn`, `acc`, `plain`. */
export const Chip = txt
  .attrs({ tag: 'span' })
  .theme((t) => ({
    padding: '1px 7px',
    marginLeft: '6px',
    borderRadius: t.radius.chip,
    border: `1px solid ${t.border2}`,
    fontFamily: t.font.mono,
    fontSize: t.size.label,
    letterSpacing: t.tracking.sm,
    color: t.muted,
    extendCss: 'display:inline-block;white-space:nowrap;line-height:1.5;',
  }))
  .states((t) => ({
    ok: { color: t.ok, extendCss: `border-color:color-mix(in srgb, ${t.ok} 40%, transparent);` },
    danger: { color: t.danger, extendCss: `border-color:color-mix(in srgb, ${t.danger} 45%, transparent);` },
    warn: { color: t.warn, extendCss: `border-color:color-mix(in srgb, ${t.warn} 40%, transparent);` },
    acc: { color: t.accent, extendCss: `border-color:color-mix(in srgb, ${t.accent} 40%, transparent);` },
    plain: {},
  }))
