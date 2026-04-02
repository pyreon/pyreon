import { Element } from '@pyreon/elements'
import rocketstyle from '@pyreon/rocketstyle'
import { getComponentTheme } from '@pyreon/ui-theme'
import { chipTheme } from './theme'

const resolved = getComponentTheme(chipTheme)

const Chip = rocketstyle({ useBooleans: true })({ name: 'Chip', component: Element })
  .attrs({ tag: 'div' } as any)
  .theme(resolved.base)
  .states(resolved.states)
  .sizes(resolved.sizes)
  .variants(resolved.variants)

export default Chip
