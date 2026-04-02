import { Element } from '@pyreon/elements'
import rocketstyle from '@pyreon/rocketstyle'
import { getComponentTheme } from '@pyreon/ui-theme'
import { tooltipTheme } from './theme'

const resolved = getComponentTheme(tooltipTheme)

const Tooltip = rocketstyle({ useBooleans: true })({
  name: 'Tooltip',
  component: Element,
})
  .attrs({ tag: 'div' } as any)
  .theme(resolved.base)

export default Tooltip
