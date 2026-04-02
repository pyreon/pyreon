import { Element } from '@pyreon/elements'
import rocketstyle from '@pyreon/rocketstyle'
import { getComponentTheme } from '@pyreon/ui-theme'
import { indicatorTheme } from './theme'

const resolved = getComponentTheme(indicatorTheme)

const Indicator = rocketstyle({ useBooleans: true })({ name: 'Indicator', component: Element })
  .attrs({ tag: 'span' } as any)
  .theme(resolved.base)
  .states(resolved.states)
  .sizes(resolved.sizes)

export default Indicator
