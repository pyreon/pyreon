import { Element } from '@pyreon/elements'
import rocketstyle from '@pyreon/rocketstyle'
import { getComponentTheme } from '@pyreon/ui-theme'
import { actionIconTheme } from './theme'

const resolved = getComponentTheme(actionIconTheme)

const ActionIcon = rocketstyle({ useBooleans: true })({ name: 'ActionIcon', component: Element })
  .attrs({ tag: 'button' } as any)
  .theme(resolved.base)
  .states(resolved.states)
  .sizes(resolved.sizes)
  .variants(resolved.variants)

export default ActionIcon
