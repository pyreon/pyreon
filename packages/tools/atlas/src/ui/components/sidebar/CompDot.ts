import { el } from '../../kit'

/**
 * A component's verdict at a glance: filled ok (every scenario verified),
 * filled danger (one failed), or a hollow warn ring (not verified — NOT a
 * pass). The view adds the words for screen readers.
 */
export const CompDot = el
  .attrs({ tag: 'span' })
  .theme((t) => ({
    width: '7px',
    height: '7px',
    flex: 'none',
    borderRadius: t.radius.round,
  }))
  .variants((t) => ({
    ok: { backgroundColor: t.ok },
    fail: { backgroundColor: t.danger },
    unverified: { backgroundColor: 'transparent', border: `1.5px solid ${t.warn}` },
  }))
