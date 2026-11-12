import { el } from '../../kit'

/** An on/off switch (`.sw2`): 34 × 20 track, ember when on. */
export const Switch = el
  .attrs({
    tag: 'button',
  })
  .theme((t) => ({
    cursor: 'pointer',
    padding: '0',
    flex: 'none',
    width: '34px',
    height: '20px',
    borderRadius: t.radius.pill,
    position: 'relative',
    justifySelf: 'start',
    border: `1px solid ${t.border2}`,
    background: t.surface2,
    transition: `background ${t.motion.slow},border-color ${t.motion.slow}`,
  }))
  .states((t) => ({
    on: { backgroundColor: t.glow, borderColor: t.accent },
    off: {},
  }))
