/**
 * A LAYOUT container — a rocketstyle chain that exists to arrange children and
 * renders as nothing without them.
 *
 * The regression fixture for the content seed: discovery reads `tag: 'div'`
 * off the attrs chain and the `Stack` name, seeds the derived scenarios with
 * placeholder BLOCKS instead of a string, and the build e2e asserts those
 * blocks show on the canvas. Kept in `components/` (not the demo catalog) and
 * free of any `@pyreon/atlas` import, because the workbench filters
 * atlas-importing files out of its own catalog.
 */
import { chipBase } from './chip-kit'

export const Stack = chipBase
  .attrs({ tag: 'div', contentDirection: 'rows', contentAlignX: 'block' })
  .theme(() => ({ gap: '10px', minWidth: '180px' }))
  .sizes(() => ({
    tight: { gap: '4px' },
    loose: { gap: '18px' },
  }))
