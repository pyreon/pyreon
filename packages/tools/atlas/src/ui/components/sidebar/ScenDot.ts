/** The three-state verdict dot: ok · fail · unverified (muted — NOT a pass). */
import { dim, el, type T } from '../../kit'

export const ScenDot = el
  .attrs({
    tag: 'span',
  })
  .theme((t: T) => ({
    width: '6px',
    height: '6px',
    borderRadius: t.radius.round,
    flex: 'none',
    background: t.border,
  }))
  .variants(
    dim((t) => ({
      ok: { backgroundColor: t.ok },
      fail: { backgroundColor: t.danger },
      unverified: {},
    })),
  )
