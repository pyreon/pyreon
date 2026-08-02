import { dim, el, type T } from '../../kit'

export const A11yIcon = el
  .attrs({
    tag: 'span',
    contentAlignX: 'center',
    contentAlignY: 'center',
  })
  .theme((t: T) => ({
    width: '20px',
    height: '20px',
    flex: 'none',
    borderRadius: t.radius.control,
    fontSize: t.size.body,
    color: '#fff',
    background: t.ok,
  }))
  .states(
    dim((t) => ({
      ok: { backgroundColor: t.ok },
      warn: { backgroundColor: t.warn },
      danger: { backgroundColor: t.danger },
      unknown: { backgroundColor: t.faint },
    })),
  )
