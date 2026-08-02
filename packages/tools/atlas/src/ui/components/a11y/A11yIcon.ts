import { dim, el, type T } from '../../kit'

export const A11yIcon = el
  .attrs({
    tag: 'span',
  })
  .theme((t: T) => ({
    width: '20px',
    height: '20px',
    flex: 'none',
    borderRadius: t.radius.control,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
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
