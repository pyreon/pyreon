import { Element } from '@pyreon/elements'
import rocketstyle from '@pyreon/rocketstyle'
import { getComponentTheme } from '@pyreon/ui-theme'
import { hoverCardTheme } from './theme'

const resolved = getComponentTheme(hoverCardTheme)

const HoverCard = rocketstyle({ useBooleans: true })({
  name: 'HoverCard',
  component: Element,
})
  .attrs({ tag: 'div' } as any)
  .theme(resolved.base)

export default HoverCard
