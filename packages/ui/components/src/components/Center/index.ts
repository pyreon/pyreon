import { Element } from '@pyreon/elements'
import rocketstyle from '@pyreon/rocketstyle'
import { getComponentTheme } from '@pyreon/ui-theme'
import { centerTheme } from './theme'

const resolved = getComponentTheme(centerTheme)

const Center = rocketstyle()({ name: 'Center', component: Element })
  .attrs({ tag: 'div', alignX: 'center', alignY: 'center', block: true } as any)
  .theme(resolved.base)

export default Center
