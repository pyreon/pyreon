import { Element } from '@pyreon/elements'
import rocketstyle from '@pyreon/rocketstyle'
import { getComponentTheme } from '@pyreon/ui-theme'
import { boxTheme } from './theme'

const resolved = getComponentTheme(boxTheme)

const Box = rocketstyle()({ name: 'Box', component: Element })
  .attrs({ tag: 'div' } as any)
  .theme(resolved.base)

export default Box
