import { Element } from '@pyreon/elements'
import rocketstyle from '@pyreon/rocketstyle'
import { getComponentTheme } from '@pyreon/ui-theme'
import { popoverTheme } from './theme'

const resolved = getComponentTheme(popoverTheme)

const Popover = rocketstyle({ useBooleans: true })({
  name: 'Popover',
  component: Element,
})
  .attrs({ tag: 'div' } as any)
  .theme(resolved.base)

export default Popover
