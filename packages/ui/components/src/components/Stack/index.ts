import { Element } from '@pyreon/elements'
import rocketstyle from '@pyreon/rocketstyle'
import { getComponentTheme } from '@pyreon/ui-theme'
import { stackTheme } from './theme'

const resolved = getComponentTheme(stackTheme)

const Stack = rocketstyle({ useBooleans: true })({ name: 'Stack', component: Element })
  .attrs({ tag: 'div', direction: 'rows', block: true } as any)
  .theme(resolved.base)
  .sizes(resolved.sizes)

export default Stack
