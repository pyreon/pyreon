import { Element } from '@pyreon/elements'
import rocketstyle from '@pyreon/rocketstyle'
import { getComponentTheme } from '@pyreon/ui-theme'
import { cardTheme } from './theme'

const resolved = getComponentTheme(cardTheme)

const Card = rocketstyle({ useBooleans: true })({ name: 'Card', component: Element })
  .attrs({ tag: 'div', direction: 'rows', block: true } as any)
  .theme(resolved.base)
  .variants(resolved.variants)

export default Card
