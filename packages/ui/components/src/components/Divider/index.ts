import { Element } from '@pyreon/elements'
import rocketstyle from '@pyreon/rocketstyle'
import { getComponentTheme } from '@pyreon/ui-theme'
import { dividerTheme } from './theme'

const resolved = getComponentTheme(dividerTheme)

const Divider = rocketstyle({ useBooleans: true })({ name: 'Divider', component: Element })
  .attrs({ tag: 'hr' } as any)
  .theme(resolved.base)
  .variants(resolved.variants)
  .sizes(resolved.sizes)

export default Divider
