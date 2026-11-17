/**
 * Core text wrapper — inline typography based on @pyreon/elements Text.
 * Re-uses the `element` base pipeline so all responsive/theme/pseudo-state
 * logic is shared. Adds text-specific variants (left/centered/right).
 */

import { Text } from '@pyreon/elements'
import element from './element'

export default element
  .config({
    component: Text,
    name: 'core/Text',
  })
  .theme((t) => ({
    lineHeight: t.lineHeight.base,
    fontFamily: t.fontFamily.base,
    margin: t.space.reset,
    padding: t.space.reset,
    fontWeight: 300,
  }))
  .multiple({
    left: { textAlign: 'left' },
    centered: { textAlign: 'center' },
    right: { textAlign: 'right' },
  })
