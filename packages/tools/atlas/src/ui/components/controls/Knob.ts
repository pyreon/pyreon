import { el } from '../../kit'

/** The switch's thumb — fog when off, ember when on. */
export const Knob = el
  .attrs({
    tag: 'span',
  })
  .theme((t) => ({
    position: 'absolute',
    top: '2px',
    left: '2px',
    width: '14px',
    height: '14px',
    borderRadius: t.radius.round,
    background: t.faint,
    transition: `transform ${t.motion.slow},background ${t.motion.slow}`,
  }))
  .states((t) => ({
    on: { transform: 'translateX(14px)', backgroundColor: t.accent },
    off: {},
  }))
