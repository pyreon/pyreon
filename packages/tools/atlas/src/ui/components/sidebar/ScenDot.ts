/** The three-state verdict dot: ok · fail · unverified (muted — NOT a pass). */
import { el } from '../../kit'

export const ScenDot = el
  .attrs({
    tag: 'span',
  })
  .theme((t) => ({
    width: '6px',
    height: '6px',
    borderRadius: t.radius.round,
    flex: 'none',
    background: t.border,
  }))
  .variants(
    (t) => ({
      ok: { backgroundColor: t.ok },
      fail: { backgroundColor: t.danger },
      unverified: {},
    }),
  )
