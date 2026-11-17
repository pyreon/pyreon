import { breakpoints } from '../theme'
import { el } from './bases'

/*
 * Call-to-action layout for static pages only (heroes, the showcase): kept out
 * of controls.tsx, which the demo islands bundle, so no island ships it.
 */

/**
 * A row of call-to-action controls that wraps. On a phone every control takes
 * the full width, so a stack of pills and the install command shares one
 * edge instead of ending at three different widths.
 */
export const ctaStackOnPhone = `@media (max-width: ${breakpoints.sm - 0.02}px) { & > * { flex: 1 1 100%; justify-content: center; } }`

/** The pills after an install command: they wrap as one group, so the command never strands one pill on a line of its own. */
export const PillGroup = el
  .config({ name: 'PillGroup' })
  .attrs({ block: true, contentDirection: 'inline', contentAlignY: 'center', gap: 12 })
  // Shrink-wrapped beside the command (a block group took the whole row and always wrapped).
  .theme(() => ({ width: 'auto', flex: '0 1 auto', flexWrap: 'wrap', minWidth: 0, extendCss: ctaStackOnPhone }))
