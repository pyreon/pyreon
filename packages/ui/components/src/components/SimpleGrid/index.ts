import { Element } from '@pyreon/elements'
import rocketstyle from '@pyreon/rocketstyle'
import { getComponentTheme } from '@pyreon/ui-theme'
import { simpleGridTheme } from './theme'

const resolved = getComponentTheme(simpleGridTheme)

const SimpleGrid = rocketstyle({ useBooleans: true })({ name: 'SimpleGrid', component: Element })
  .attrs({ tag: 'div' } as any)
  .theme(resolved.base)
  .sizes(resolved.sizes)

export default SimpleGrid
