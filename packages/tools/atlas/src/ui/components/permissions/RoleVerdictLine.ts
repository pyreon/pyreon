import { txt } from '../../kit'

/** The card's verdict line — green, red or faint (`.okc` / `.errc`). */
export const RoleVerdictLine = txt
  .attrs({ tag: 'p' })
  .theme((t) => ({ margin: '0', lineHeight: '1.45', overflowWrap: 'anywhere', color: t.muted }))
  .states((t) => ({
    ok: { color: t.ok },
    violation: { color: t.danger },
    unguarded: { color: t.warn },
    pending: { color: t.faint },
  }))
