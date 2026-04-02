import { Element } from '@pyreon/elements'
import rocketstyle from '@pyreon/rocketstyle'
import { getComponentTheme } from '@pyreon/ui-theme'
import { groupTheme } from './theme'

const resolved = getComponentTheme(groupTheme)

const Group = rocketstyle({ useBooleans: true })({ name: 'Group', component: Element })
  .attrs({ tag: 'div', direction: 'inline', block: true } as any)
  .theme(resolved.base)
  .sizes(resolved.sizes)

export default Group
