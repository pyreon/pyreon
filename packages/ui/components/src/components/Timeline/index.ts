import { Element } from '@pyreon/elements'
import rocketstyle from '@pyreon/rocketstyle'
import { getComponentTheme } from '@pyreon/ui-theme'
import { timelineTheme } from './theme'

const resolved = getComponentTheme(timelineTheme)

const Timeline = rocketstyle({ useBooleans: true })({ name: 'Timeline', component: Element })
  .attrs({ tag: 'div', direction: 'rows' } as any)
  .theme(resolved.base)

export default Timeline
