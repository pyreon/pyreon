import { txt } from '../../kit'

/**
 * A scenario's verify verdict on the docs page. `ok` reads as a PASS — the
 * accent `PropKind` it used to borrow is the workbench's orange-red, which
 * made every verified scenario look like an error.
 */
export const VerdictTag = txt
  .attrs({
    tag: 'span',
  })
  .theme((t) => ({
    fontFamily: t.font.mono,
    fontSize: t.size.small,
    fontWeight: '600',
    padding: '1px 8px',
    borderRadius: t.radius.item,
    border: t.hairline,
  }))
  .states(
    (t) => ({
      ok: { color: t.ok, borderColor: t.ok },
      fail: { color: t.danger, borderColor: t.danger },
      unverified: { color: t.muted },
    }),
  )
