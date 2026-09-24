import { el } from '../../kit'

export const Switch = el
  .attrs({
    tag: 'button',
  })
  .theme((t) => ({
    cursor: 'pointer',
    border: 'none',
    padding: '0',
    width: '40px',
    height: '24px',
    borderRadius: t.radius.pill,
    position: 'relative',
    transition: `background ${t.motion.slow}`,
    background: t.border,
  }))
  .states(
    (t) => ({
      on: { backgroundColor: t.accent },
      off: {},
    }),
  )
