import { Text } from '@pyreon/elements'
import rocketstyle from '@pyreon/rocketstyle'
import { getComponentTheme } from '@pyreon/ui-theme'
import { badgeTheme } from './theme'

const resolved = getComponentTheme(badgeTheme)

const Badge = rocketstyle({ useBooleans: true })({ name: 'Badge', component: Text })
  .attrs({ tag: 'span' } as any)
  .theme(resolved.base)
  .states(resolved.states)
  .sizes(resolved.sizes)
  .variants(resolved.variants)

export default Badge
