import { dim, el, type T } from '../../kit'

export const Switch = el
  .attrs({
    tag: 'button',
  })
  .theme((t: T) => ({
    cursor: 'pointer',
    border: 'none',
    padding: '0',
    width: '42px',
    height: '24px',
    borderRadius: t.radius.pill,
    position: 'relative',
    transition: `background ${t.motion.slow}`,
    background: t.border,
  }))
  .states(
    dim((t) => ({
      on: { backgroundColor: t.accent },
      off: {},
    })),
  )
