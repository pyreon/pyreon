import { Element } from '@pyreon/elements'
import rocketstyle from '@pyreon/rocketstyle'
import { getComponentTheme } from '@pyreon/ui-theme'
import { alertTheme } from './theme'

const resolved = getComponentTheme(alertTheme)

const Alert = rocketstyle({ useBooleans: true })({ name: 'Alert', component: Element })
  .attrs({ tag: 'div', direction: 'inline', alignY: 'center', block: true } as any)
  .theme(resolved.base)
  .states(resolved.states)
  .variants(resolved.variants)

export default Alert
