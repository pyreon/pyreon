import { dim, el, type T } from '../../kit'

export const SegBtn = el
  .attrs({
    tag: 'button',
  })
  .theme((t: T) => ({
    font: 'inherit',
    fontSize: t.size.input,
    fontWeight: '600',
    cursor: 'pointer',
    border: 'none',
    padding: '8px 16px',
    borderRadius: t.radius.button,
    transition: `all ${t.motion.base}`,
    color: t.muted,
    background: 'transparent',
  }))
  .states(
    dim((t) => ({
      active: {
        color: t.text,
        backgroundColor: t.bg,
        boxShadow: '0 1px 3px rgba(15,18,30,.12)',
      },
      idle: {},
    })),
  )
