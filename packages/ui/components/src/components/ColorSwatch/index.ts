import { Element } from '@pyreon/elements'
import rocketstyle from '@pyreon/rocketstyle'
import { getComponentTheme } from '@pyreon/ui-theme'
import { colorSwatchTheme } from './theme'

const resolved = getComponentTheme(colorSwatchTheme)

const ColorSwatch = rocketstyle({ useBooleans: true })({ name: 'ColorSwatch', component: Element })
  .attrs({ tag: 'div' } as any)
  .theme(resolved.base)
  .sizes(resolved.sizes)

export default ColorSwatch
