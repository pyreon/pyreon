import { el, type T } from '../../kit'

export const Knob = el
  .attrs({
    tag: 'span',
  })
  .theme((t: T) => ({
    position: 'absolute',
    top: '2px',
    width: '20px',
    height: '20px',
    borderRadius: t.radius.round,
    background: '#fff',
    boxShadow: '0 1px 3px rgba(0,0,0,.3)',
    transition: `left ${t.motion.slow}`,
    left: '2px',
  }))
  .states(() => ({
    on: { left: '20px' },
    off: {},
  }))
