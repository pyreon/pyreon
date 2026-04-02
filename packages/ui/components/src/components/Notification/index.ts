import { Element } from '@pyreon/elements'
import rocketstyle from '@pyreon/rocketstyle'
import { getComponentTheme } from '@pyreon/ui-theme'
import { notificationTheme } from './theme'

const resolved = getComponentTheme(notificationTheme)

const Notification = rocketstyle({ useBooleans: true })({ name: 'Notification', component: Element })
  .attrs({ tag: 'div', direction: 'rows', block: true } as any)
  .theme(resolved.base)
  .states(resolved.states)

export default Notification
