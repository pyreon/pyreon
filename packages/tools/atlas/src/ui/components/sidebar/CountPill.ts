import { txt } from '../../kit'

/** A mono chip (`.chip2`), neutral or `ok` (the verified count). */
export const CountPill = txt
  .attrs({ tag: 'span' })
  .theme((t) => ({
    fontFamily: t.font.mono,
    fontSize: t.size.label,
    height: '22px',
    lineHeight: '20px',
    padding: '0 8px',
    borderRadius: t.radius.pill,
    border: `1px solid ${t.border2}`,
    color: t.muted,
    whiteSpace: 'nowrap',
  }))
  .variants((t) => ({
    ok: { color: t.ok, borderColor: `color-mix(in srgb, ${t.ok} 40%, transparent)` },
    fail: { color: t.danger, borderColor: `color-mix(in srgb, ${t.danger} 40%, transparent)` },
    warn: { color: t.warn, borderColor: `color-mix(in srgb, ${t.warn} 40%, transparent)` },
    plain: {},
  }))
