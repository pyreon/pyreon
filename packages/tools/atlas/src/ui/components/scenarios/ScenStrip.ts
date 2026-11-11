import { el } from '../../kit'

/** The scenario strip (`.at-scen`): 40px, tabs on the left, verdict on the right. */
export const ScenStrip = el
  .attrs({ tag: 'div', contentDirection: 'inline', contentAlignY: 'center', gap: 8 })
  .theme((t) => ({
    flex: 'none',
    height: '40px',
    minWidth: '0',
    padding: '0 10px',
    borderBottom: t.hairline,
    background: t.surface,
  }))
